import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Instruction, JOB_STATUS } from '@nocobase/plugin-workflow';
import type { FlowNodeModel, Processor } from '@nocobase/plugin-workflow';
import PluginFileManagerServer from '@nocobase/plugin-file-manager';

import { renderAndDownload, ThirdsApiError, type ThirdsFormat } from './thirds-client';
import {
  EXT,
  FORMATS,
  MIME,
  buildQrCodes,
  buildRequestBody,
  idempotencyKey,
  parseJsonObject,
  plain,
  safeFilename,
  sha256,
  substituteNocoBaseVariables,
  type QrSpec,
} from './render-utils';

export const INSTRUCTION_TYPE = 'thirds-render';

export type RenderNodeConfig = {
  collection?: string;
  recordId?: unknown;
  field?: string;
  attachMode?: 'replace' | 'append';
  fileCollection?: string;
  includeRecord?: boolean;
  recordFields?: string[];
  appends?: string[];
  source?: 'html' | 'template';
  html?: string;
  templateId?: string;
  templateVersion?: unknown;
  sizeId?: string;
  data?: unknown;
  qrCodes?: QrSpec[];
  format?: ThirdsFormat;
  pdf?: { format?: string; landscape?: boolean; printBackground?: boolean; margin?: string };
  image?: { width?: unknown; height?: unknown; quality?: unknown; transparent?: boolean };
  filename?: string;
  reference?: string;
  retentionDays?: unknown;
  timeoutSeconds?: unknown;
  ignoreFail?: boolean;
};

const ASSOC_MANY = new Set(['belongsToMany', 'hasMany']);
const SYSTEM_FIELDS = new Set(['createdAt', 'updatedAt', 'createdById', 'updatedById', 'sort']);

/** "{{t(\"Name\")}}" style titles become "Name". */
const cleanTitle = (title: unknown): string => {
  const s = String(title ?? '');
  const m = s.match(/^\{\{\s*t\(\s*["'](.+?)["']/);
  return m ? m[1] : s;
};

/** Scalar fields of the record as [{ name, label, value }], in collection order. */
export const recordFieldList = (record: Record<string, any>, collection: any) => {
  const labels = new Map<string, string>();
  for (const f of collection?.fields?.values?.() ?? []) {
    labels.set(f.name, cleanTitle(f.options?.uiSchema?.title) || f.name);
  }
  return Object.entries(record)
    .filter(([k, v]) => !SYSTEM_FIELDS.has(k) && (v === null || ['string', 'number', 'boolean'].includes(typeof v)))
    .map(([name, v]) => ({ name, label: labels.get(name) ?? name, value: v === null ? '' : v }));
};

/** Error details that are safe to keep in the job log. Never includes headers or the key. */
const errorResult = (e: any) => ({
  message: String(e?.message ?? e),
  ...(e instanceof ThirdsApiError ? { status: e.status, code: e.code } : {}),
});

export class RenderInstruction extends Instruction {
  async run(node: FlowNodeModel, prevJob: any, processor: Processor) {
    const raw = (node.config ?? {}) as RenderNodeConfig;
    try {
      const result = await this.render(node, raw, processor);
      return { status: JOB_STATUS.RESOLVED, result };
    } catch (e: any) {
      processor.logger.warn(`thirds-render (#${node.id}) failed: ${e?.message ?? e}`);
      return { status: raw.ignoreFail ? JOB_STATUS.RESOLVED : JOB_STATUS.FAILED, result: errorResult(e) };
    }
  }

  private async render(node: FlowNodeModel, raw: RenderNodeConfig, processor: Processor) {
    const apiKey = process.env.THIRDS_API_KEY;
    if (!apiKey) throw new Error('THIRDS_API_KEY is not set in the NocoBase server environment');
    const baseUrl = process.env.THIRDS_API_BASE || 'https://thirds.ai';

    // 1. Resolve every config value except the HTML. The HTML keeps its own {{ }} blocks for thirds.ai.
    const { html: rawHtml, ...rest } = raw;
    const qrSpecs = processor.getParsedValue(rest.qrCodes ?? [], node.id) as QrSpec[];
    const qr = await buildQrCodes(qrSpecs);
    const scope = { additionalScope: { $qr: qr } };
    const cfg = processor.getParsedValue(rest, node.id, scope) as RenderNodeConfig;

    const format = (cfg.format ?? 'pdf') as ThirdsFormat;
    if (!FORMATS.includes(format)) throw new Error(`Unsupported format: ${format}`);
    const source = cfg.source === 'template' ? 'template' : 'html';

    // 2. The record and the attachment field it is written to (both optional).
    const db = this.workflow.app.db;
    const [dataSourceName, collectionName] = String(cfg.collection ?? '').includes(':')
      ? String(cfg.collection).split(':')
      : ['main', cfg.collection];
    if (collectionName && dataSourceName !== 'main') {
      throw new Error('Only collections in the main data source are supported');
    }
    const collection = collectionName ? db.getCollection(collectionName) : null;
    if (collectionName && !collection) throw new Error(`Collection ${collectionName} not found`);
    const recordId = cfg.recordId === '' ? undefined : cfg.recordId;
    const transaction =
      processor.getScopeTransaction(node, 'main') ?? this.workflow.useDataSourceTransaction('main', processor.transaction);

    let fieldDef: any = null;
    if (cfg.field) {
      if (!collection) throw new Error('Choose a collection before choosing an attachment field');
      fieldDef = collection.getField(cfg.field);
      if (!fieldDef) throw new Error(`Field ${cfg.field} not found on ${collectionName}`);
      if (recordId === undefined || recordId === null) throw new Error('Record ID is empty');
    }
    const fileCollection = String(fieldDef?.options?.target ?? cfg.fileCollection ?? 'attachments');
    const fileColl = db.getCollection(fileCollection);
    if (!fileColl || (fileColl.options as any)?.template !== 'file') {
      throw new Error(`${fileCollection} is not a file collection`);
    }

    let record: Record<string, any> | undefined;
    if (collection && recordId !== undefined && recordId !== null && cfg.includeRecord !== false) {
      const found = await db.getRepository(collectionName).findOne({
        filterByTk: recordId as any,
        appends: Array.isArray(cfg.appends) && cfg.appends.length ? cfg.appends : undefined,
        transaction,
      });
      if (!found) throw new Error(`Record ${String(recordId)} not found in ${collectionName}`);
      record = plain(found);
      if (cfg.field) delete record[cfg.field];
      if (Array.isArray(cfg.recordFields) && cfg.recordFields.length) {
        const keep = new Set(cfg.recordFields);
        record = Object.fromEntries(Object.entries(record).filter(([k]) => keep.has(k)));
      }
    }

    // 3. Data for the template: user data, then record, title, fields and qr (these win on clashes).
    // fields is a list, so a template can loop over the record without naming every field.
    const data: Record<string, any> = { ...parseJsonObject(cfg.data, 'Data') };
    if (record) {
      data.record = record;
      data.title = String(record.title ?? record.name ?? record.number ?? record.code ?? `#${record.id ?? ''}`);
      data.fields = recordFieldList(record, collection);
    }
    data.qr = qr;

    const html =
      source === 'html'
        ? substituteNocoBaseVariables(String(rawHtml ?? ''), (expr) =>
            processor.getParsedValue(expr, node.id, { additionalScope: { $qr: qr, $record: record } }),
          )
        : undefined;

    const fallbackName = `${collectionName ?? 'render'}-${recordId ?? Date.now()}`;
    const filename = safeFilename(cfg.filename, safeFilename(fallbackName, 'render'));
    const body = buildRequestBody({
      source,
      format,
      html,
      templateId: cfg.templateId,
      templateVersion: cfg.templateVersion,
      sizeId: cfg.sizeId,
      data,
      filename,
      reference: cfg.reference || `nocobase ${collectionName ?? ''} ${recordId ?? ''}`.trim(),
      retentionDays: cfg.retentionDays,
      pdf: cfg.pdf,
      image: cfg.image,
    });

    // 4. Render. The idempotency key is built from the node, record and request body.
    const key = idempotencyKey({ body, nodeKey: node.key, collection: collectionName ?? '', recordId, format });
    const timeoutSeconds = Number(cfg.timeoutSeconds) > 0 ? Number(cfg.timeoutSeconds) : 120;
    const { buffer, job, replayed } = await renderAndDownload(
      { apiKey, baseUrl, timeoutMs: timeoutSeconds * 1000 },
      format,
      body,
      key,
    );
    if (!buffer.length) throw new Error(`thirds.ai job ${job.id} returned an empty file`);

    // 5. Store the file through NocoBase file storage, then link it to the record.
    const fileManager = this.workflow.app.pm.get(PluginFileManagerServer) as PluginFileManagerServer;
    if (!fileManager) throw new Error('The file manager plugin is required');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'thirds-render-'));
    let fileRecord: any;
    try {
      const filePath = path.join(dir, `${filename}.${EXT[format]}`);
      await fs.writeFile(filePath, buffer);
      fileRecord = await fileManager.createFileRecord({
        collectionName: fileCollection,
        filePath,
        values: { mimetype: MIME[format] },
        transaction,
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }

    if (fieldDef) {
      const type = fieldDef.type;
      const relation = db.getRepository<any>(`${collectionName}.${cfg.field}`, recordId as any);
      if (ASSOC_MANY.has(type)) {
        if (cfg.attachMode === 'append') await relation.add({ tk: fileRecord.id, transaction });
        else await relation.set({ tk: [fileRecord.id], transaction });
      } else if (type === 'belongsTo' || type === 'hasOne') {
        await relation.set({ tk: fileRecord.id, transaction });
      } else {
        throw new Error(`Field ${cfg.field} is not an attachment field`);
      }
    }

    const file = plain(fileRecord);
    // The node result is the file record itself, so a Mailer node can attach it directly.
    // No signed thirds.ai link is stored here.
    return {
      ...file,
      thirds: {
        jobId: job.id,
        format,
        replayed,
        bytes: buffer.length,
        sha256: sha256(buffer),
        credit: job.credit ?? null,
      },
      target: fieldDef ? { collection: collectionName, recordId, field: cfg.field } : null,
    };
  }
}

export default RenderInstruction;
