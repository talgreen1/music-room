// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import type { Position, Room } from './model';
const h = vi.hoisted(() => ({
  receive: undefined as undefined | ((room: Room | null) => void), status: undefined as undefined | ((status: string) => void),
  editable: true, viewer: undefined as any, position: { page: 3, offset: .2, zoom: 2 } as Position,
  publish: vi.fn(), follow: vi.fn(), cancel: vi.fn()
}));
vi.mock('./rooms', () => ({
  cloudConfigured: true, localServerConfigured: false, songbook: { pdfTitle: 'Book', pdfVersion: '1' },
  RoomService: class {
    async init() {} leave() {}
    watch(_code: string, receive: (room: Room | null) => void, status: (status: string) => void) { h.receive = receive; h.status = status; status('Connected'); }
    isMaster() { return h.editable; } canControl() { return h.editable; } participantId() { return 'owner'; } shouldFollow() { return true; }
    publish = h.publish;
  }
}));
vi.mock('./viewer', () => ({ SongbookViewer: class {
  count = 145; onPinchEnd?: () => void;
  constructor() { h.viewer = this; }
  async load() {} follow = h.follow;
  cancelFollow() {} destroy() {}
  cancelGesture() { h.cancel(); this.onPinchEnd?.(); }
  position() { return h.position; }
} }));
const flush = async () => { for (let n = 0; n < 30; n++) await Promise.resolve(); };
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('streams a controller pinch, suppresses remote jumps through final-write completion and immediately honors source/role/reconnect changes', async () => {
  vi.useFakeTimers(); h.publish.mockResolvedValue(undefined);
  document.body.innerHTML = '<div id="app"></div>'; history.replaceState({}, '', '/?room=123456');
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
  await import('./main'); await flush();
  const active: Room = { masterId: 'owner', createdAt: Date.now(), expiresAt: Date.now() + 86400000, pdfUrl: '/book.pdf', pdfVersion: '1', pdfTitle: 'Book', position: { page: 1, offset: 0, zoom: 1, sequence: 1 } };
  const receive = async (sequence: number, changes: Partial<Room> = {}) => { h.receive!({ ...active, position: { page: 1, offset: .4, zoom: 1.4, sequence, writerId: 'b'.repeat(32) }, ...changes }); await flush(); };
  await receive(1); h.follow.mockClear();
  h.viewer.onPinchStart(); h.viewer.onPosition(h.position, false);
  await vi.advanceTimersByTimeAsync(80); expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ page: 3, zoom: 2 }));
  await receive(2); expect(h.follow).not.toHaveBeenCalled();
  let finish!: () => void; h.publish.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  h.viewer.onPinchEnd(); await vi.advanceTimersByTimeAsync(0);
  expect(h.publish).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3, zoom: 2, sourceId: 'pdf' }));
  await receive(3); expect(h.follow).not.toHaveBeenCalled();
  finish(); await flush(); await receive(4); expect(h.follow).toHaveBeenCalledOnce();
  h.viewer.onPinchStart(); h.editable = false; await receive(5);
  expect(h.cancel).toHaveBeenCalled(); expect(h.follow).toHaveBeenLastCalledWith(expect.objectContaining({ sequence: 5 }), true, true);
  const sent = h.publish.mock.calls.length;
  h.viewer.onPinchEnd(); await vi.advanceTimersByTimeAsync(80); expect(h.publish).toHaveBeenCalledTimes(sent);
  h.editable = true; await receive(6); h.viewer.onPinchStart();
  await receive(7, { sheet: { id: 'a'.repeat(32), title: 'Other', pdfUrl: '/other.pdf' } });
  expect(h.follow).toHaveBeenLastCalledWith(expect.objectContaining({ sequence: 7 }), true, true);
  h.viewer.onPinchStart(); await receive(8, { sheet: { id: 'a'.repeat(32), title: 'Other', pdfUrl: '/other.pdf' }, position: { page: 8, offset: 0, zoom: 1, sequence: 8 } });
  expect(h.follow).toHaveBeenLastCalledWith(expect.objectContaining({ page: 8, sequence: 8 }), true, true);
  h.viewer.onPinchStart(); h.status!('Offline'); h.status!('Connected');
  expect(h.follow).toHaveBeenLastCalledWith(expect.objectContaining({ sequence: 8 }), true, true);
  history.replaceState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); await flush();
});
