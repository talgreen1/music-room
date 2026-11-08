// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ auth: vi.fn(), snapshot: undefined as any, reject: undefined as any, unsubscribe: vi.fn() }));
vi.mock('firebase/app', () => ({ getApps: () => [{ name: '[DEFAULT]' }] }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), signInAnonymously: h.auth }));
vi.mock('firebase/database', async original => ({ ...await original<typeof import('firebase/database')>(), getDatabase: () => ({}), ref: (_db: unknown, path: string) => path,
  onValue: (_path: string, snapshot: any, reject: any) => { h.snapshot = snapshot; h.reject = reject; return h.unsubscribe; } }));
const flush = async () => { for (let n = 0; n < 15; n++) await Promise.resolve(); };
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); h.auth.mockReset().mockResolvedValue({ user: { uid: 'musician' } }); h.unsubscribe.mockClear();
  for (const key of ['VITE_FIREBASE_API_KEY','VITE_FIREBASE_DATABASE_URL','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_AUTH_DOMAIN']) vi.stubEnv(key, 'test'); vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'false'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
it('reports initialization stages and releases the one-shot clock listener', async () => {
  const { RoomService } = await import('./rooms'); const service = new RoomService(), phase = vi.fn();
  const initialized = service.init(phase); await flush(); h.snapshot({ val: () => 120 }); await initialized;
  expect(phase.mock.calls.flat()).toEqual(['authentication', 'clock']); expect(h.unsubscribe).toHaveBeenCalledOnce();
  expect((service as any).serverOffset).toBe(120); expect((service as any).initialized).toBe(true);
});
it('bounds anonymous sign-in waiting and permits retry without accepting a late result', async () => {
  const { RoomService } = await import('./rooms'); const service = new RoomService(); let late!: (value: unknown) => void;
  h.auth.mockImplementationOnce(() => new Promise(resolve => { late = resolve; }));
  const result = service.init().catch(error => error); await vi.advanceTimersByTimeAsync(30000);
  expect((await result).code).toBe('room/authentication-timeout'); late({ user: { uid: 'obsolete' } }); await flush();
  expect(service.participantId()).not.toBe('obsolete');
  const retry = service.init(); await flush(); h.snapshot({ val: () => 0 }); await retry; expect(service.participantId()).toBe('musician');
});
it('times out or cancels a stalled clock read and removes its listener', async () => {
  const { RoomService } = await import('./rooms'); const service = new RoomService();
  const result = service.init().catch(error => error); await flush(); await vi.advanceTimersByTimeAsync(15000);
  expect((await result).code).toBe('room/server-clock-timeout'); expect(h.unsubscribe).toHaveBeenCalledOnce();
  const controller = new AbortController(), aborted = service.init(undefined, controller.signal).catch(error => error); await flush(); controller.abort();
  expect((await aborted).name).toBe('AbortError'); expect(h.unsubscribe).toHaveBeenCalledTimes(2);
});
it('preserves Firebase error codes instead of replacing the underlying error', async () => {
  const { RoomService } = await import('./rooms'); const service = new RoomService(), denied = Object.assign(new Error('denied'), { code: 'auth/network-request-failed' });
  h.auth.mockRejectedValueOnce(denied); await expect(service.init()).rejects.toBe(denied);
});
