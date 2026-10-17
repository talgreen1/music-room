// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { subscriptions } = vi.hoisted(() => ({ subscriptions: new Map<string, (snapshot: { val(): unknown }) => void>() }));
vi.mock('firebase/database', async original => ({
  ...await original<typeof import('firebase/database')>(),
  ref: (_db: unknown, path: string) => path,
  onValue: (path: string, callback: (snapshot: { val(): unknown }) => void) => {
    subscriptions.set(path, callback); return () => subscriptions.delete(path);
  }
}));
import { RoomService } from './rooms';
import type { Room } from './model';
const code = '123456';
const room = (): Room => ({ masterId: 'owner', createdAt: Date.now(), expiresAt: Date.now() + 86400000, pdfUrl: '/book.pdf', pdfVersion: 'v1', pdfTitle: 'Book', position: { page: 1, offset: 0, zoom: 1, sequence: 1 } });
let service: RoomService;
beforeEach(() => { sessionStorage.clear(); subscriptions.clear(); service = new RoomService(); Object.assign(service, { db: {}, uid: 'owner' }); });
afterEach(() => { service.leave(); vi.useRealTimers(); vi.restoreAllMocks(); });
const emit = (value: Room | null) => subscriptions.get(`rooms/${code}`)!({ val: () => value });
function watch(creator = true) {
  if (creator) sessionStorage.setItem(`music-master:${code}`, '1');
  const received = vi.fn(); service.watch(code, received, vi.fn(), vi.fn()); return received;
}
describe('Master ownership recovery', () => {
  it('restores the original creator after a missing snapshot and repeated interruptions', () => {
    const received = watch(), active = room();
    emit(active); expect(service.isMaster(active)).toBe(true); expect(service.canControl()).toBe(true);
    for (let n = 0; n < 2; n++) {
      emit(null); expect(service.canControl()).toBe(false); expect(received).toHaveBeenLastCalledWith(null);
      emit(active); expect(service.isMaster(active)).toBe(true); expect(service.canControl()).toBe(true);
    }
  });
  it('never grants ownership without both the matching identity and saved creator marker', () => {
    const active = room(); watch(false); emit(null); emit(active);
    expect(service.isMaster(active)).toBe(false); expect(service.canControl()).toBe(false);
    service.leave(); watch(); emit({ ...active, masterId: 'someone-else' });
    expect(service.canControl()).toBe(false);
    emit(active); expect(service.isMaster(active)).toBe(true);
    sessionStorage.removeItem(`music-master:${code}`); emit(active);
    expect(service.canControl()).toBe(false);
  });
  it('does not revive an expired room and honors server clock offset', () => {
    vi.useFakeTimers(); const received = watch(), active = room();
    Object.assign(service, { serverOffset: 5000 });
    emit({ ...active, expiresAt: Date.now() + 4000 });
    expect(service.canControl()).toBe(false); expect(service.isMaster(active)).toBe(false); expect(received).toHaveBeenLastCalledWith(null);
    emit(active); expect(service.canControl()).toBe(true);
    vi.advanceTimersByTime(86400000); expect(service.canControl()).toBe(false);
    emit(active); expect(service.canControl()).toBe(false);
  });
  it('keeps approved-controller access separate from ownership during recovery', () => {
    watch(false); const active: Room = { ...room(), controllers: { owner: true } };
    emit(active); emit(null); emit(active);
    expect(service.canControl()).toBe(true); expect(service.isMaster(active)).toBe(false);
  });
});
