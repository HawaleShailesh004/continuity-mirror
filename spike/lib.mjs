// Shared helpers for B0 spike scripts. Never prints the API key.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const out = (...p) => join(root, 'spike-output', ...p);
export const assets = (...p) => join(root, 'spike-assets', ...p);

const env = Object.fromEntries(
  (await readFile(join(root, '.env.local'), 'utf8'))
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const base = env.YOUCAM_API_BASE.replace(/\/$/, '');
const auth = { Authorization: `Bearer ${env.YOUCAM_API_KEY}` };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { ...auth, 'Content-Type': 'application/json' } : auth,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

export async function balance() {
  const r = await api('GET', '/s2s/v1.0/client/credit');
  return (r.body?.results ?? []).reduce((s, x) => s + (x.amount ?? 0), 0);
}

// The normalised baseline every endpoint gets: JPEG, long side 1024, EXIF stripped.
export async function normalise(input, transform) {
  let img = sharp(input).rotate();
  if (transform) img = transform(img);
  return img.resize({ width: 1024, height: 1024, fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();
}

export async function upload(buf, name, log) {
  const meta = { content_type: 'image/jpeg', file_name: name, file_size: buf.length };
  const init = await api('POST', '/s2s/v2.0/file', { files: [meta] });
  log.push({ step: 'file-init', ...init });
  const f = init.body?.data?.files?.[0] ?? init.body?.files?.[0] ?? init.body?.data;
  const req = f?.requests?.[0] ?? f?.requests;
  if (!f?.file_id || !req?.url) throw new Error(`file init unexpected: ${init.status} ${JSON.stringify(init.body).slice(0, 400)}`);
  const put = await fetch(req.url, { method: req.method ?? 'PUT', headers: { ...(req.headers ?? {}), 'Content-Length': String(buf.length) }, body: buf });
  log.push({ step: 'file-put', status: put.status });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  return f.file_id;
}

// Create a task, poll until terminal, return { status, body, ms, url }.
export async function runTask(path, body, log, { intervalMs = 3000, maxMs = 180000 } = {}) {
  const started = Date.now();
  const create = await api('POST', path, body);
  log.push({ step: 'task-create', path, request: body, ...create });
  const taskId = create.body?.data?.task_id;
  if (!taskId) return { status: 'create-failed', body: create.body, ms: Date.now() - started };
  while (Date.now() - started < maxMs) {
    await sleep(intervalMs);
    const poll = await api('GET', `${path}/${taskId}`);
    const st = poll.body?.data?.task_status;
    if (st === 'success' || st === 'error' || poll.status >= 400) {
      log.push({ step: 'task-final', ...poll });
      const r = poll.body?.data?.results;
      const url = typeof r?.url === 'string' ? r.url : Array.isArray(r) ? (r[0]?.url ?? r[0]) : undefined;
      return { status: st ?? `http-${poll.status}`, body: poll.body, ms: Date.now() - started, url, taskId };
    }
  }
  return { status: 'timeout', ms: Date.now() - started, taskId };
}

export async function download(url, file) {
  const res = await fetch(url);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

export async function saveJson(file, data) {
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2));
}
