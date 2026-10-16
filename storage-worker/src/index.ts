import { database, HttpError, identity, requireAdmin, requireUpload, type AuthEnv, type Fetcher } from './auth';
import { GitHub, type GitHubEnv, type Asset } from './github';

export interface Env extends AuthEnv, GitHubEnv { PUBLIC_ORIGIN: string; ALLOWED_ORIGINS: string }
type FilePath = { uid: string; id: string; filename: string; assetId?: string };
function path(value: string): FilePath {
  const match = /^\/files\/([A-Za-z0-9_-]{1,128})\/([a-f0-9]{32})\/(?:(\d+)-)?(document\.pdf|(?:[0-9]|[1-3][0-9])\.jpg)$/.exec(value);
  if (!match) throw new HttpError(404, 'Unknown file path.');
  return { uid: match[1], id: match[2], assetId: match[3], filename: match[4] };
}

/** Keep two bytes back until full validation, so invalid streams never complete an asset. */
export function validateBody(size: number, pdf: boolean): TransformStream<Uint8Array, Uint8Array> {
  let count = 0, prefix = new Uint8Array(), tail = new Uint8Array();
  return new TransformStream({
    transform(chunk, controller) {
      count += chunk.length;
      if (count > size) throw new HttpError(400, 'Incorrect upload size.');
      if (prefix.length < 1024) {
        const next = new Uint8Array(Math.min(1024, prefix.length + chunk.length));
        next.set(prefix); next.set(chunk.subarray(0, next.length - prefix.length), prefix.length); prefix = next;
      }
      if (chunk.length >= 2) {
        if (tail.length) controller.enqueue(tail);
        if (chunk.length > 2) controller.enqueue(chunk.subarray(0, chunk.length - 2));
        tail = chunk.slice(-2);
      } else if (chunk.length) {
        const joined = new Uint8Array(tail.length + chunk.length); joined.set(tail); joined.set(chunk, tail.length);
        if (joined.length > 2) controller.enqueue(joined.subarray(0, joined.length - 2));
        tail = joined.slice(-2);
      }
    },
    flush(controller) {
      if (count !== size || (pdf ? !new TextDecoder().decode(prefix).includes('%PDF-') :
        prefix[0] !== 255 || prefix[1] !== 216 || prefix[2] !== 255 || tail[0] !== 255 || tail[1] !== 217)) throw new HttpError(400, 'Invalid PDF or JPEG file.');
      controller.enqueue(tail);
    }
  });
}

async function deletable(file: FilePath, token: string, env: Env, send: Fetcher) {
  const responses = await Promise.all(['songs/' + file.id, 'defaultFile', 'rooms', 'songbook'].map(key => database(key, token, env, send)));
  if (responses.some(response => !response.ok)) throw new HttpError(503, 'Could not check file retention.');
  const [song, defaultId, rooms, original] = await Promise.all(responses.map(response => response.json())) as [
    { ownerId: string; deletedAt?: number } | null, string | null,
    Record<string, { expiresAt: number; pdfUrl?: string; sheet?: { id: string } }> | null,
    { pdfUrl?: string } | null
  ];
  const prefix = `${env.PUBLIC_ORIGIN}/files/${file.uid}/${file.id}/`;
  if ((song && (song.ownerId !== file.uid || !song.deletedAt)) || defaultId === file.id || original?.pdfUrl?.startsWith(prefix) ||
      Object.values(rooms || {}).some(room => room.expiresAt > Date.now() && (room.sheet?.id === file.id || room.pdfUrl?.startsWith(prefix)))) throw new HttpError(409, 'File is retained by the library, default or an active room.');
}

export async function handle(request: Request, env: Env, send: Fetcher = fetch): Promise<Response> {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map(value => value.trim());
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Room-Code,X-File-Size,Range',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges', 'X-Content-Type-Options': 'nosniff'
  };
  try {
    if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(env.PUBLIC_ORIGIN) || !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY) || !env.GITHUB_TOKEN) throw new HttpError(503, 'Storage is not configured.');
    if (origin && !allowed.includes(origin) && request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(403, 'Origin is not allowed.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const file = path(new URL(request.url).pathname);
    const github = new GitHub(env, send);
    const name = `${file.uid}_${file.id}_${file.filename}`;
    const pdf = file.filename === 'document.pdf';
    const mime = pdf ? 'application/pdf' : 'image/jpeg';
    if (request.method === 'GET' || request.method === 'HEAD') {
      if (!file.assetId) throw new HttpError(404, 'File not found.');
      const asset = await github.metadata(file.assetId, name);
      if (request.method === 'HEAD') return new Response(null, { headers: { ...cors, 'Content-Type': mime, 'Content-Length': String(asset.size), 'Cache-Control': 'public, max-age=3600' } });
      const response = await github.download(file.assetId, request.headers.get('Range'));
      const headers = new Headers(cors);
      for (const key of ['Content-Length', 'Content-Range', 'Accept-Ranges']) if (response.headers.has(key)) headers.set(key, response.headers.get(key)!);
      headers.set('Content-Type', mime); headers.set('Cache-Control', 'public, max-age=3600');
      return new Response(response.body, { status: response.status, headers });
    }
    if (request.method !== 'POST' && request.method !== 'DELETE') throw new HttpError(405, 'Method not allowed.');
    const token = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') || '')?.[1];
    if (!token) throw new HttpError(401, 'Sign in before uploading.');
    const uid = await identity(token, env, send);
    if (request.method === 'DELETE') {
      await requireAdmin(token, env, send);
      if (!file.assetId) throw new HttpError(400, 'An asset ID is required.');
      await deletable(file, token, env, send);
      try { await github.metadata(file.assetId, name); }
      catch (error) { if (error instanceof HttpError && error.status === 404) return new Response(null, { status: 204, headers: cors }); throw error; }
      const response = await github.call(`releases/assets/${file.assetId}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new HttpError(502, 'File cleanup failed. Try again.');
      return new Response(null, { status: 204, headers: cors });
    }
    if (file.assetId || uid !== file.uid) throw new HttpError(403, 'Uploads must use your own immutable namespace.');
    await requireUpload(request.headers.get('X-Room-Code'), token, env, send);
    const size = Number(request.headers.get('X-File-Size'));
    if (!Number.isSafeInteger(size) || size < 5 || size > (pdf ? 30 : 3) * 1024 * 1024 || !request.body || request.headers.get('Content-Type') !== mime) throw new HttpError(400, 'Choose a valid PDF (30 MB) or JPEG (3 MB).');
    const release = await github.release(file.id);
    const fixed = new FixedLengthStream(size);
    const abort = new AbortController();
    let streamError: unknown;
    const piping = request.body.pipeThrough(validateBody(size, pdf)).pipeTo(fixed.writable, { signal: abort.signal });
    // Register rejection immediately; fetch also fails when the fixed stream is aborted.
    const completed = piping.then(() => null, error => { streamError = error; return new HttpError(400, 'Invalid file bytes or upload size.'); });
    let response: Response;
    try { response = await github.call(`releases/${release}/assets?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': mime }, body: fixed.readable, signal: abort.signal }, true); }
    catch {
      const invalid = streamError instanceof HttpError ? streamError : undefined;
      abort.abort();
      throw invalid || new HttpError(502, 'File upload interrupted. Try again.');
    }
    if (!response.ok) {
      abort.abort();
      throw new HttpError(response.status === 422 ? 409 : 502, response.status === 422 ? 'This file already exists. Start a new upload.' : 'GitHub upload failed.');
    }
    const invalid = await completed;
    if (invalid) throw invalid;
    const asset = await response.json() as Asset;
    if (!Number.isSafeInteger(asset.id) || asset.name !== name || asset.size !== size || asset.state !== 'uploaded') throw new HttpError(502, 'Storage did not confirm the upload.');
    return Response.json({ url: `${env.PUBLIC_ORIGIN}/files/${uid}/${file.id}/${asset.id}-${file.filename}` }, { status: 201, headers: cors });
  } catch (error) {
    // Never return upstream URLs, tokens, API responses or stack traces.
    return Response.json({ error: error instanceof HttpError ? error.message : 'Storage service unavailable. Try again.' }, { status: error instanceof HttpError ? error.status : 503, headers: cors });
  }
}
export default { fetch(request: Request, env: Env) { return handle(request, env, fetch); } };
