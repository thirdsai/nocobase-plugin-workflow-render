/**
 * Minimal thirds.ai client: create a render job, poll it, download the file.
 * The API key is passed in by the caller (read from the server environment) and is
 * only ever sent in the Authorization header of the create and poll calls. The signed
 * download link does not need the key, so it is fetched without it.
 */
export type ThirdsFormat = 'pdf' | 'png' | 'jpeg' | 'webp';

export class ThirdsApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ThirdsApiError';
    this.status = status;
    this.code = code;
  }
}

export type ThirdsJob = {
  id: string;
  status: 'cancelled' | 'failed' | 'queued' | 'running' | 'succeeded';
  artifact?: { byte_size?: number; expires_at?: string; media_type?: string; sha256?: string } | null;
  credit?: string;
  download?: { expires_at?: string; url?: string } | null;
  error?: { category?: string; code?: string } | null;
  [k: string]: unknown;
};

export type ClientOptions = {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  pollIntervalMs?: number;
  fetchImpl?: typeof fetch;
};

export const kindFor = (format: ThirdsFormat): 'image' | 'pdf' => (format === 'pdf' ? 'pdf' : 'image');

const readError = async (res: Response): Promise<{ code?: string; message: string }> => {
  try {
    const body: any = await res.json();
    const err = body?.error ?? body;
    return { code: err?.code, message: String(err?.message ?? `HTTP ${res.status}`) };
  } catch {
    return { message: `HTTP ${res.status}` };
  }
};

export async function renderAndDownload(
  opts: ClientOptions,
  format: ThirdsFormat,
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<{ buffer: Buffer; contentType: string; job: ThirdsJob; replayed: boolean }> {
  const f = opts.fetchImpl ?? fetch;
  const deadline = Date.now() + opts.timeoutMs;
  const remaining = () => Math.max(1000, deadline - Date.now());
  const base = opts.baseUrl.replace(/\/+$/, '');
  const kind = kindFor(format);
  const auth = `Bearer ${opts.apiKey}`;

  const res = await f(`${base}/v1/${kind}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      Accept: 'application/json',
      Authorization: auth,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    signal: AbortSignal.timeout(remaining()),
  });
  if (!res.ok) {
    const e = await readError(res);
    throw new ThirdsApiError(`thirds.ai ${kind} request failed: ${e.message}`, res.status, e.code);
  }
  const replayed = res.headers.get('idempotency-replayed') === 'true';
  let job = (await res.json()) as ThirdsJob;

  while (job.status === 'queued' || job.status === 'running') {
    if (Date.now() > deadline) throw new ThirdsApiError('thirds.ai render timed out', 504, 'timeout');
    await new Promise((r) => setTimeout(r, opts.pollIntervalMs ?? 1500));
    const poll = await f(`${base}/v1/${kind}/${encodeURIComponent(job.id)}`, {
      headers: { Accept: 'application/json', Authorization: auth },
      signal: AbortSignal.timeout(remaining()),
    });
    if (!poll.ok) {
      const e = await readError(poll);
      throw new ThirdsApiError(`thirds.ai job poll failed: ${e.message}`, poll.status, e.code);
    }
    job = (await poll.json()) as ThirdsJob;
  }

  if (job.status !== 'succeeded') {
    throw new ThirdsApiError(
      `thirds.ai job ${job.id} ${job.status}: ${job.error?.code ?? 'no code'}`,
      422,
      job.error?.code ?? job.status,
    );
  }
  const rel = job.download?.url;
  if (!rel) throw new ThirdsApiError(`thirds.ai job ${job.id} has no download URL`, 502, 'no_download');

  const dl = await f(new URL(rel, `${base}/`).toString(), { signal: AbortSignal.timeout(remaining()) });
  if (!dl.ok) throw new ThirdsApiError(`thirds.ai download failed: HTTP ${dl.status}`, dl.status, 'download_failed');
  const buffer = Buffer.from(await dl.arrayBuffer());
  const contentType = (dl.headers.get('content-type') ?? job.artifact?.media_type ?? '').split(';')[0].trim();
  return { buffer, contentType, job, replayed };
}
