import { createHash } from 'crypto';
import QRCode from 'qrcode';
import type { ThirdsFormat } from './thirds-client';

export const FORMATS: ThirdsFormat[] = ['pdf', 'png', 'jpeg', 'webp'];
export const EXT: Record<ThirdsFormat, string> = { pdf: 'pdf', png: 'png', jpeg: 'jpg', webp: 'webp' };
export const MIME: Record<ThirdsFormat, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export const sha256 = (v: Buffer | string) => createHash('sha256').update(v).digest('hex');

export const escapeHtml = (v: unknown): string =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '"': '&quot;', '&': '&amp;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[c] as string,
  );

/** Stable JSON: object keys sorted, so the same data always hashes the same. */
export const stableStringify = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as any)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as any)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
};

/** A name that matches the thirds.ai filename pattern and is safe on disk. */
export const safeFilename = (raw: unknown, fallback: string): string => {
  let s = String(raw ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\.(pdf|png|jpe?g|webp)$/i, '')
    .replace(/[^A-Za-z0-9 ._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[^A-Za-z0-9]+/, '')
    .trim()
    .slice(0, 100)
    .trim();
  if (!s) s = fallback;
  return s;
};

/**
 * Replaces only NocoBase variables ({{$context...}}, {{$jobsMapByNodeKey...}}, {{$qr...}} and so on)
 * in an HTML string. Anything else in double braces, such as {{ record.title }} or {% for %}
 * blocks, is left alone so thirds.ai can evaluate it as a Jinja-style template.
 * Values are HTML-escaped unless they are data: URIs (QR codes).
 */
export const substituteNocoBaseVariables = (html: string, resolve: (expr: string) => unknown): string =>
  html.replace(/\{\{\s*(\$[A-Za-z_][^{}]*?)\s*\}\}/g, (_m, expr: string) => {
    const value = resolve(`{{${expr}}}`);
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' && value.startsWith('data:image/')) return value;
    if (typeof value === 'object') return escapeHtml(JSON.stringify(value));
    return escapeHtml(value);
  });

export type QrSpec = { name?: string; value?: unknown; errorCorrection?: 'L' | 'M' | 'Q' | 'H' };

/** QR codes are generated inside NocoBase as SVG data URIs, so they cost nothing extra to render. */
export async function buildQrCodes(specs: QrSpec[] | undefined): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const spec of specs ?? []) {
    const name = String(spec?.name ?? '').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(name)) {
      throw new Error(`QR code name "${name}" must be a simple identifier, for example asset or link`);
    }
    const value = spec?.value === null || spec?.value === undefined ? '' : String(spec.value);
    if (!value) throw new Error(`QR code "${name}" has an empty value`);
    if (value.length > 2000) throw new Error(`QR code "${name}" value is longer than 2000 characters`);
    const svg = await QRCode.toString(value, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: spec?.errorCorrection ?? 'M',
    });
    out[name] = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }
  return out;
}

/** Turns an ORM value into plain JSON (dates become ISO strings). */
export const plain = (v: any): any => (v === undefined ? undefined : JSON.parse(JSON.stringify(v ?? null)));

export const parseJsonObject = (v: unknown, label: string): Record<string, any> => {
  if (v === undefined || v === null || v === '') return {};
  let obj = v;
  if (typeof v === 'string') {
    try {
      obj = JSON.parse(v);
    } catch {
      throw new Error(`${label} is not valid JSON`);
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(`${label} must be a JSON object`);
  return obj as Record<string, any>;
};

const toInt = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
};

const MARGIN_RE = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?(?:px|in|cm|mm)$/;

export type BodyInput = {
  source: 'html' | 'template';
  format: ThirdsFormat;
  html?: string;
  templateId?: string;
  templateVersion?: unknown;
  sizeId?: string;
  data: Record<string, any>;
  filename: string;
  reference?: string;
  retentionDays?: unknown;
  pdf?: { format?: string; landscape?: boolean; printBackground?: boolean; margin?: string };
  image?: { width?: unknown; height?: unknown; quality?: unknown; transparent?: boolean };
};

/** Builds the snake_case JSON body for POST /v1/pdf or /v1/image. */
export function buildRequestBody(input: BodyInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.source === 'template') {
    const id = String(input.templateId ?? '').trim();
    if (!/^tpl_[0-9a-f]{32}$/.test(id)) throw new Error('Template ID must look like tpl_ followed by 32 hex characters');
    body.template_id = id;
    const version = toInt(input.templateVersion);
    if (version !== undefined) body.version = version;
    body.data = input.data;
    if (input.format !== 'pdf' && input.sizeId) body.size_id = String(input.sizeId);
  } else {
    const html = String(input.html ?? '');
    if (!html.trim()) throw new Error('HTML is empty');
    body.html = html;
    // With data, the HTML is evaluated as a Jinja-style template; without it, it is sent as is.
    if (Object.keys(input.data).some((k) => k !== 'qr' || Object.keys(input.data.qr ?? {}).length)) body.data = input.data;
  }

  if (input.format === 'pdf') {
    const pdf: Record<string, unknown> = {};
    const p = input.pdf ?? {};
    if (p.format) pdf.format = p.format;
    if (p.landscape) pdf.landscape = true;
    pdf.print_background = p.printBackground !== false;
    if (p.margin) {
      if (!MARGIN_RE.test(p.margin)) throw new Error('PDF margin must look like 10mm, 0.5in or 12px');
      pdf.margins = { top: p.margin, right: p.margin, bottom: p.margin, left: p.margin };
    }
    body.pdf = pdf;
  } else {
    const img: Record<string, unknown> = { format: input.format };
    const i = input.image ?? {};
    const w = toInt(i.width);
    const h = toInt(i.height);
    if (w !== undefined) img.width = w;
    if (h !== undefined) img.height = h;
    const q = toInt(i.quality);
    if (q !== undefined && input.format !== 'png') img.quality = q;
    if (i.transparent && input.format !== 'jpeg') img.transparent = true;
    body.image = img;
  }

  body.filename = input.filename;
  if (input.reference) body.reference = String(input.reference).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 200);
  const retention = toInt(input.retentionDays);
  if (retention !== undefined) body.retention_days = retention;
  return body;
}

export const idempotencyKey = (p: {
  body: Record<string, unknown>;
  nodeKey: string;
  collection: string;
  recordId: unknown;
  format: ThirdsFormat;
}): string =>
  'nocobase-' +
  sha256([p.nodeKey, p.collection, String(p.recordId ?? ''), p.format, sha256(stableStringify(p.body))].join('\n')).slice(
    0,
    48,
  );
