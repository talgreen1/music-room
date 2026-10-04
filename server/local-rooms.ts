import { randomInt, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { MAX_ZOOM, MIN_ZOOM, type Room, type Position } from '../src/model';
import { AdminSessions } from './admin-auth';
import { validateSongbook, validatePdfUpload, MAX_PDF_BYTES, type Songbook } from '../src/songbook';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

type Listener = (room: Room | null) => void;
type Entry = { room: Room; token: string; listeners: Set<Listener> };
export class LocalRoomStore {
  private rooms = new Map<string, Entry>();
  constructor(private now = Date.now, private code = () => String(randomInt(100000, 1000000))) {}
  create(descriptor: Pick<Room, 'masterId' | 'pdfUrl' | 'pdfVersion' | 'pdfTitle'>) {
    this.prune();
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = this.code();
      if (this.rooms.has(code)) continue;
      const now = this.now();
      const room: Room = { ...descriptor, createdAt: now, expiresAt: now + 86400000, position: { page: 1, offset: 0, zoom: 1, sequence: 0, updatedAt: now } };
      const token = randomBytes(32).toString('hex');
      this.rooms.set(code, { room, token, listeners: new Set() });
      return { code, room: structuredClone(room), token };
    }
    throw new Error('Could not reserve a room code.');
  }
  read(code: string) { const entry = this.rooms.get(code); return entry && entry.room.expiresAt > this.now() ? structuredClone(entry.room) : null; }
  publish(code: string, token: string, position: Position): 'ok' | 'missing' | 'forbidden' | 'invalid' {
    const entry = this.rooms.get(code);
    if (!entry || entry.room.expiresAt <= this.now()) return 'missing';
    if (!token || token !== entry.token) return 'forbidden';
    const horizontal = position.horizontal ?? 0;
    if (!Number.isInteger(position.page) || position.page < 1 || position.page > 10000 || !Number.isFinite(position.offset) || position.offset < 0 || position.offset > 1 || !Number.isFinite(position.zoom) || position.zoom < MIN_ZOOM || position.zoom > MAX_ZOOM || !Number.isFinite(horizontal) || horizontal < 0 || horizontal > 1) return 'invalid';
    entry.room.position = { page: position.page, offset: position.offset, zoom: position.zoom, horizontal, sequence: (entry.room.position.sequence || 0) + 1, updatedAt: this.now() };
    for (const listener of entry.listeners) listener(structuredClone(entry.room));
    return 'ok';
  }
  subscribe(code: string, listener: Listener) {
    const entry = this.rooms.get(code);
    if (!entry || entry.room.expiresAt <= this.now()) { listener(null); return () => {}; }
    entry.listeners.add(listener); listener(structuredClone(entry.room));
    return () => { entry.listeners.delete(listener); };
  }
  prune() {
    for (const [code, entry] of this.rooms) if (entry.room.expiresAt <= this.now()) {
      for (const listener of entry.listeners) listener(null);
      this.rooms.delete(code);
    }
  }
  list() { this.prune(); return Object.fromEntries([...this.rooms].map(([code, entry]) => [code, structuredClone(entry.room)])); }
  delete(code?: string) {
    for (const [key, entry] of this.rooms) if (!code || code === key) {
      this.rooms.delete(key); for (const listener of entry.listeners) listener(null);
    }
  }
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body));
};
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new Error('Request too large.'); chunks.push(Buffer.from(chunk)); }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object.');
  return parsed as Record<string, unknown>;
}

/** Development-only shared backend. No cloud accounts or extra packages needed. */
export function localRoomsPlugin(env: Record<string, string> = {}): Plugin {
  const store = new LocalRoomStore();
  const auth = env.MUSIC_ADMIN_PASSWORD ? new AdminSessions(env.MUSIC_ADMIN_PASSWORD) : undefined;
  let current: Songbook = { pdfUrl: env.VITE_PDF_URL || '/songbooks/songbook-2026-10.pdf', pdfVersion: env.VITE_PDF_VERSION || '2026-10', pdfTitle: env.VITE_PDF_TITLE || 'חוברת שירים' };
  const loaded = readFile('.local-data/songbook.json', 'utf8').then(text => { current = validateSongbook(JSON.parse(text)); }).catch(error => { if (error.code !== 'ENOENT') console.error('Could not read saved songbook configuration', error); });
  return {
    name: 'music-room-local-backend',
    configureServer(server) {
      const expiry = setInterval(() => store.prune(), 10000); expiry.unref();
      server.httpServer?.once('close', () => clearInterval(expiry));
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/local-rooms') && !url.pathname.startsWith('/api/admin') && !url.pathname.startsWith('/api/songbooks/') && url.pathname !== '/api/songbook') { next(); return; }
        void (async () => {
          // Prevent other websites from creating/modifying local rooms through the browser.
          if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { json(res, 403, { error: 'Origin not allowed.' }); return; }
          await loaded;
          if (url.pathname.startsWith('/api/songbooks/') && req.method === 'GET') {
            const filename = /^\/api\/songbooks\/([a-f0-9]{32}\.pdf)$/.exec(url.pathname)?.[1];
            if (!filename) { json(res, 404, { error: 'PDF not found.' }); return; }
            try {
              const bytes = await readFile(`.local-data/songbooks/${filename}`);
              res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': bytes.length, 'Cache-Control': 'public,max-age=31536000,immutable', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes);
            } catch { json(res, 404, { error: 'PDF not found.' }); } return;
          }
          if (url.pathname === '/api/songbook' && req.method === 'GET') { json(res, 200, current); return; }
          if (url.pathname.startsWith('/api/admin')) {
            if (!auth) { json(res, 503, { error: 'Set MUSIC_ADMIN_PASSWORD in the server environment.' }); return; }
            if (url.pathname === '/api/admin/login' && req.method === 'POST') {
              try {
                const token = auth.login((await body(req)).password, req.socket.remoteAddress || 'unknown');
                res.setHeader('Set-Cookie', `music_admin=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=3600`);
                json(res, 200, { ok: true });
              } catch (error) { json(res, 401, { error: (error as Error).message }); } return;
            }
            if (!auth.authorized(req.headers.cookie)) { json(res, 401, { error: 'Sign in to Settings.' }); return; }
            if (url.pathname === '/api/admin/upload' && req.method === 'POST') {
              if (Number(req.headers['content-length']) > MAX_PDF_BYTES) { json(res, 413, { error: 'Choose a PDF file up to 30 MB.' }); return; }
              const chunks: Buffer[] = []; let size = 0;
              for await (const chunk of req) { size += chunk.length; if (size > MAX_PDF_BYTES) throw new Error('Choose a PDF file up to 30 MB.'); chunks.push(Buffer.from(chunk)); }
              const bytes = Buffer.concat(chunks); validatePdfUpload(size, bytes);
              const filename = `${randomBytes(16).toString('hex')}.pdf`;
              await mkdir('.local-data/songbooks', { recursive: true }); await writeFile(`.local-data/songbooks/${filename}`, bytes, { flag: 'wx' });
              json(res, 201, { pdfUrl: `/api/songbooks/${filename}` }); return;
            }
            if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
              auth.logout(req.headers.cookie); res.setHeader('Set-Cookie', 'music_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0'); json(res, 200, { ok: true }); return;
            }
            if (url.pathname === '/api/admin/rooms' && req.method === 'GET') { json(res, 200, store.list()); return; }
            const target = /^\/api\/admin\/rooms(?:\/(\d{6}))?$/.exec(url.pathname);
            if (target && req.method === 'DELETE') { store.delete(target[1]); json(res, 200, { ok: true }); return; }
            if (url.pathname === '/api/admin/songbook' && req.method === 'PUT') {
              const value = validateSongbook(await body(req) as unknown as Songbook);
              await mkdir('.local-data', { recursive: true }); await writeFile('.local-data/songbook.json', JSON.stringify(value)); current = value;
              json(res, 200, current); return;
            }
            json(res, 404, { error: 'Settings operation not found.' }); return;
          }
          if (url.pathname === '/api/local-rooms' && req.method === 'POST') {
            const input = await body(req);
            for (const key of ['masterId', 'pdfUrl', 'pdfVersion', 'pdfTitle']) if (typeof input[key] !== 'string' || !(input[key] as string).length || (input[key] as string).length > 2048) { json(res, 400, { error: 'Invalid room configuration.' }); return; }
            json(res, 201, store.create({ masterId: input.masterId as string, ...current })); return;
          }
          const match = /^\/api\/local-rooms\/(\d{6})(\/events)?$/.exec(url.pathname);
          if (!match) { json(res, 404, { error: 'Room not found.' }); return; }
          const code = match[1];
          if (req.method === 'GET' && match[2]) {
            if (!store.read(code)) { json(res, 404, { error: 'Room not found or expired.' }); return; }
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
            res.flushHeaders();
            const unsubscribe = store.subscribe(code, room => { res.write(`data: ${JSON.stringify({ room, serverTime: Date.now() })}\n\n`); if (!room) res.end(); });
            const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15000); heartbeat.unref();
            res.once('close', () => { clearInterval(heartbeat); unsubscribe(); }); return;
          }
          if (req.method === 'GET') { const room = store.read(code); json(res, room ? 200 : 404, { room, serverTime: Date.now() }); return; }
          if (req.method === 'PATCH' && !match[2]) {
            const input = await body(req);
            const result = store.publish(code, req.headers.authorization?.replace(/^Bearer /, '') || '', input as unknown as Position);
            json(res, { ok: 200, missing: 404, forbidden: 403, invalid: 400 }[result], result === 'ok' ? { ok: true } : { error: result === 'forbidden' ? 'Only the Master may control this room.' : result }); return;
          }
          json(res, 405, { error: 'Method not allowed.' });
        })().catch(error => { if (!res.headersSent) json(res, 400, { error: error instanceof Error ? error.message : 'Invalid request.' }); else res.end(); });
      });
    }
  };
}
