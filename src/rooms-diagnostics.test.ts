// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ callbacks: new Map<string, (snapshot: { val(): unknown }) => void>(), send: vi.fn() }));
vi.mock('firebase/database', async original => ({
  ...await original<typeof import('firebase/database')>(), ref: (_db: unknown, path: string) => path, set: h.send,
  onValue: (path: string, callback: (snapshot: { val(): unknown }) => void) => { h.callbacks.set(path, callback); return () => h.callbacks.delete(path); }
}));
import { RoomService } from './rooms';
import { recordSyncDiagnostic } from './sync-diagnostics';
let service: RoomService;
beforeEach(() => { vi.useFakeTimers(); h.send.mockReset().mockResolvedValue(undefined); vi.spyOn(console, 'debug').mockImplementation(() => {}); service = new RoomService(); Object.assign(service, { db: {}, uid: 'device' }); });
afterEach(() => { service.leave(); history.replaceState({}, '', '/'); delete window.musicRoomSyncDiagnostics; vi.useRealTimers(); vi.restoreAllMocks(); });
const active = () => ({ masterId: 'owner', createdAt: Date.now() - 1000, expiresAt: Date.now() + 86400000, position: { sequence: 0 } });
it('uploads only opt-in active-room sessions in the musician namespace and stops when unavailable or leaving', async () => {
  history.replaceState({}, '', '/?room=123456&syncDebug=1');
  service.watch('123456', vi.fn(), vi.fn(), vi.fn()); const room = active(); const emit = (value: unknown) => h.callbacks.get('rooms/123456')!({ val: () => value });
  emit(room); recordSyncDiagnostic({ event: 'pinch-start' }); await vi.advanceTimersByTimeAsync(5000);
  expect(h.send).toHaveBeenCalledWith(expect.stringMatching(/^syncDiagnostics\/123456\/device\/[a-f0-9]{32}$/), expect.objectContaining({ roomCreatedAt: room.createdAt, batch: 1 }));
  emit(room); await vi.advanceTimersByTimeAsync(5000); expect(h.send).toHaveBeenCalledOnce();
  emit(null); recordSyncDiagnostic({ event: 'pinch-start' }); await vi.advanceTimersByTimeAsync(5000); expect(h.send).toHaveBeenCalledOnce();
  emit(room); await vi.advanceTimersByTimeAsync(5000); expect(h.send).toHaveBeenCalledTimes(2);
  service.leave(); recordSyncDiagnostic({ event: 'pinch-start' }); await vi.advanceTimersByTimeAsync(5000); expect(h.send).toHaveBeenCalledTimes(2);
});
it('never starts server uploads in a normal room session', async () => {
  history.replaceState({}, '', '/?room=123456'); service.watch('123456', vi.fn(), vi.fn(), vi.fn());
  h.callbacks.get('rooms/123456')!({ val: active }); await vi.advanceTimersByTimeAsync(10000); expect(h.send).not.toHaveBeenCalled();
});
