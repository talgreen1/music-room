// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
let service: import('./rooms').RoomService;
const flush = async () => { for (let n = 0; n < 25; n++) await Promise.resolve(); };
beforeEach(() => { vi.resetModules();
  for (const key of ['VITE_FIREBASE_API_KEY','VITE_FIREBASE_DATABASE_URL','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_AUTH_DOMAIN','VITE_USE_FIREBASE_EMULATORS']) vi.stubEnv(key, '');
});
afterEach(() => { service?.leave(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('preserves HTTP status and phase for failures while reading or joining a local room', async () => {
  const { RoomService } = await import('./rooms'); service = new RoomService();
  const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })); vi.stubGlobal('fetch', fetch);
  const error = vi.fn(); service.watch('123456', vi.fn(), vi.fn(), error); await flush();
  expect(error).toHaveBeenLastCalledWith(expect.objectContaining({ status: 503, code: 'room/read-failed' }));
  service.leave(); fetch.mockResolvedValueOnce(new Response(JSON.stringify({ room: { masterId: 'other' } }), { status: 200 })).mockResolvedValueOnce(new Response('', { status: 403 }));
  service.watch('123456', vi.fn(), vi.fn(), error); await flush();
  expect(error).toHaveBeenLastCalledWith(expect.objectContaining({ status: 403, code: 'room/join-failed' }));
});
it('ignores a connection response that arrives after leaving the room', async () => {
  const { RoomService } = await import('./rooms'); service = new RoomService(); let finish!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
  const error = vi.fn(), receive = vi.fn(); service.watch('123456', receive, vi.fn(), error); service.leave();
  finish(new Response('', { status: 503 })); await flush(); expect(error).not.toHaveBeenCalled(); expect(receive).not.toHaveBeenCalled();
});
