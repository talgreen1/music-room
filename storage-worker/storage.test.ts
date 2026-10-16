import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { webcrypto } from 'node:crypto';

const uid = 'musician', id = 'a'.repeat(32), base = `https://files.example/files/${uid}/${id}`;
let runtime: Miniflare, privateKey: CryptoKey, jwk: JsonWebKey;
let active = true, admin = false, deleted = false, currentDefault = false, inUse = false, conflict = false, unavailable = false;
let writes = 0, removals = 0, stored: Uint8Array | undefined, cdnAuth: string | null = null;
let assetFilename = 'document.pdf', originalRetained = false, absentCatalog = false, redirect = 'https://release-assets.githubusercontent.com/signed-file';
const bytes = new TextEncoder().encode('%PDF-1.7\nfixture');
async function token(overrides = {}, badSignature = false) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = encode({ alg: 'RS256', kid: 'test' });
  const body = encode({ aud: 'test-project', iss: 'https://securetoken.google.com/test-project', sub: uid, iat: Math.floor(Date.now() / 1000), auth_time: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, ...overrides });
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, Buffer.from(`${head}.${body}`));
  return `${head}.${body}.${badSignature ? Buffer.alloc(256).toString('base64url') : Buffer.from(signature).toString('base64url')}`;
}
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
beforeAll(async () => {
  const pair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  privateKey = pair.privateKey; jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const bundle = await build({ entryPoints: ['storage-worker/src/index.ts'], bundle: true, write: false, format: 'esm', target: 'es2022' });
  runtime = new Miniflare(convertV4MiniflareOptions({ name: 'storage-test', modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-01',
    bindings: { FIREBASE_PROJECT_ID: 'test-project', FIREBASE_DATABASE_URL: 'https://database.example', GITHUB_REPOSITORY: 'owner/files', GITHUB_TOKEN: 'server-only', PUBLIC_ORIGIN: 'https://files.example', ALLOWED_ORIGINS: 'https://app.example' },
    outboundService: async request => {
      const url = new URL(request.url);
      if (url.hostname === 'www.googleapis.com') return json({ keys: [{ ...jwk, kid: 'test' }] });
      if (url.hostname === 'database.example') {
        if (url.pathname === '/rooms.json') return admin ? json(url.searchParams.has('shallow') ? {} : (inUse ? { room: { expiresAt: Date.now() + 10000, sheet: { id } } } : {})) : json({}, 401);
        if (url.pathname === '/rooms/123456.json') return json(active ? { expiresAt: Date.now() + 10000 } : null);
        if (url.pathname === `/songs/${id}.json`) return json(absentCatalog ? null : { ownerId: uid, ...(deleted ? { deletedAt: Date.now() } : {}) });
        if (url.pathname === '/defaultFile.json') return json(currentDefault ? id : 'pdf');
        if (url.pathname === '/songbook.json') return json(originalRetained ? { pdfUrl: `${base}/42-document.pdf` } : null);
        throw new Error(`Unexpected Database path ${url.pathname}`);
      }
      expect(request.headers.get('Authorization')).toBe(url.hostname.endsWith('github.com') ? 'Bearer server-only' : null);
      if (url.hostname === 'uploads.github.com') {
        writes++; if (conflict) return json({}, 422); if (unavailable) return json({}, 503);
        stored = new Uint8Array(await request.arrayBuffer());
        expect(request.headers.get('Content-Length')).toBe(String(stored.length));
        return json({ id: 42, name: url.searchParams.get('name'), size: stored.length, state: 'uploaded' }, 201);
      }
      if (url.pathname.includes('/releases/tags/')) return json({ id: 7 });
      if (url.pathname.endsWith('/releases/assets/42')) {
        if (request.method === 'DELETE') { removals++; return new Response(null, { status: 204 }); }
        if (request.headers.get('Accept') === 'application/octet-stream') return new Response(null, { status: 302, headers: { Location: redirect } });
        return json({ id: 42, name: `${uid}_${id}_${assetFilename}`, size: bytes.length, state: 'uploaded' });
      }
      if (url.hostname === 'release-assets.githubusercontent.com') {
        cdnAuth = request.headers.get('Authorization');
        return new Response(bytes, { headers: { 'Content-Length': String(bytes.length) } });
      }
      throw new Error(`Unexpected upstream ${url.hostname}${url.pathname}`);
    }
  }));
});
afterAll(async () => { await runtime?.dispose(); });
beforeEach(() => { active = true; admin = deleted = currentDefault = inUse = conflict = unavailable = originalRetained = absentCatalog = false; writes = removals = 0; assetFilename = 'document.pdf'; redirect = 'https://release-assets.githubusercontent.com/signed-file'; });

async function upload(body = bytes, options: { auth?: string; path?: string; room?: string | null; size?: number; origin?: string } = {}) {
  return runtime.dispatchFetch(options.path || `${base}/document.pdf`, { method: 'POST', headers: {
    Authorization: `Bearer ${options.auth || await token()}`, 'Content-Type': 'application/pdf', 'X-File-Size': String(options.size ?? body.length),
    ...(options.room === null ? {} : { 'X-Room-Code': options.room || '123456' }), Origin: options.origin || 'https://app.example'
  }, body });
}

describe('GitHub storage in the actual Worker runtime with isolated upstream services', () => {
  it('streams an authenticated room upload and serves exact public bytes without forwarding the repository secret', async () => {
    const response = await upload(); expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ url: `${base}/42-document.pdf` }); expect(stored).toEqual(bytes);
    const download = await runtime.dispatchFetch(`${base}/42-document.pdf`);
    expect(download.status).toBe(200); expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
    expect(download.headers.get('Access-Control-Allow-Origin')).toBe('*'); expect(cdnAuth).toBeNull();
    expect((await runtime.dispatchFetch(`${base}/42-document.pdf`, { method: 'HEAD' })).headers.get('Content-Length')).toBe(String(bytes.length));
  });
  it('rejects forged, expired and wrong-project tokens before writing assets', async () => {
    const before = writes;
    for (const auth of [await token({}, true), await token({ exp: 1 }), await token({ aud: 'another-project' })]) expect((await upload(bytes, { auth })).status).toBe(401);
    expect(writes).toBe(before);
  });
  it('enforces own namespace, active room and Settings-only uploads outside a room', async () => {
    expect((await upload(bytes, { path: base.replace(uid, 'another') + '/document.pdf' })).status).toBe(403);
    active = false; expect((await upload()).status).toBe(403); active = true;
    expect((await upload(bytes, { room: null })).status).toBe(403);
    admin = true; expect((await upload(bytes, { room: null })).status).toBe(201); admin = false;
    expect((await upload(bytes, { origin: 'https://untrusted.example' })).status).toBe(403);
  });
  it('rejects oversized, malformed and mismatched upload bodies and immutable conflicts', async () => {
    expect((await upload(bytes, { size: 31 * 1024 * 1024 })).status).toBe(400);
    expect((await upload(new TextEncoder().encode('not a PDF'))).status).toBe(400);
    expect((await upload(bytes, { size: bytes.length + 1 })).status).toBe(400);
    conflict = true; expect((await upload()).status).toBe(409); conflict = false;
  });
  it('requires Settings deletion and protects live catalog entries, defaults and active rooms', async () => {
    const del = async () => runtime.dispatchFetch(`${base}/42-document.pdf`, { method: 'DELETE', headers: { Authorization: `Bearer ${await token()}` } });
    expect((await del()).status).toBe(403);
    admin = true; expect((await del()).status).toBe(409);
    deleted = true; currentDefault = true; expect((await del()).status).toBe(409); currentDefault = false;
    inUse = true; expect((await del()).status).toBe(409); inUse = false;
    expect(removals).toBe(0); expect((await del()).status).toBe(204); expect(removals).toBe(1); admin = false;
  });
  it('does not serve an asset through a forged namespace or unknown path', async () => {
    expect((await runtime.dispatchFetch(base.replace(uid, 'other') + '/42-document.pdf')).status).toBe(404);
    expect((await runtime.dispatchFetch(`${base}/document.pdf`)).status).toBe(404);
    expect((await runtime.dispatchFetch('https://files.example/not-a-file')).status).toBe(404);
  });
  it('accepts bounded JPEG streams and rejects broken JPEG endings and indexes', async () => {
    const sendImage = async (body: Uint8Array, filename = '0.jpg') => runtime.dispatchFetch(`${base}/${filename}`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'X-Room-Code': '123456', 'Content-Type': 'image/jpeg', 'X-File-Size': String(body.length) }, body });
    const jpeg = new Uint8Array([255, 216, 255, 1, 2, 255, 217]);
    expect((await sendImage(jpeg)).status).toBe(201); expect(stored).toEqual(jpeg);
    expect((await sendImage(jpeg.slice(0, -1))).status).toBe(400);
    expect((await sendImage(jpeg, '40.jpg')).status).toBe(404);
  });
  it('cancels a large upload when storage rejects it before consuming the stream', async () => {
    const large = new Uint8Array(2 * 1024 * 1024); large.set(bytes);
    unavailable = true; expect((await upload(large)).status).toBe(502); unavailable = false;
    conflict = true; expect((await upload(large)).status).toBe(409);
  });
  it('protects the original descriptor and safely permits Settings cleanup of unreferenced orphan assets', async () => {
    admin = true; absentCatalog = true;
    const del = async () => runtime.dispatchFetch(`${base}/42-document.pdf`, { method: 'DELETE', headers: { Authorization: `Bearer ${await token()}` } });
    originalRetained = true; expect((await del()).status).toBe(409); originalRetained = false;
    expect((await del()).status).toBe(204);
    redirect = 'https://untrusted.example/steal';
    expect((await runtime.dispatchFetch(`${base}/42-document.pdf`)).status).toBe(502);
  });
});
