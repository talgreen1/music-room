import { randomInt, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { MAX_ZOOM, MIN_ZOOM, type Room, type Position } from '../src/model';

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
export function localRoomsPlugin(): Plugin {
  const store = new LocalRoomStore();
  return {
    name: 'music-room-local-backend',
    configureServer(server) {
      const expiry = setInterval(() => store.prune(), 10000); expiry.unref();
      server.httpServer?.once('close', () => clearInterval(expiry));
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/local-rooms')) { next(); return; }
        void (async () => {
          // Prevent other websites from creating/modifying local rooms through the browser.
          if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { json(res, 403, { error: 'Origin not allowed.' }); return; }
          if (url.pathname === '/api/local-rooms' && req.method === 'POST') {
            const input = await body(req);
            for (const key of ['masterId', 'pdfUrl', 'pdfVersion', 'pdfTitle']) if (typeof input[key] !== 'string' || !(input[key] as string).length || (input[key] as string).length > 2048) { json(res, 400, { error: 'Invalid room configuration.' }); return; }
            json(res, 201, store.create({ masterId: input.masterId as string, pdfUrl: input.pdfUrl as string, pdfVersion: input.pdfVersion as string, pdfTitle: input.pdfTitle as string })); return;
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
