// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import type { Room } from './model';
const h = vi.hoisted(() => ({
  receive: undefined as any, status: undefined as any, error: undefined as any, load: vi.fn(), init: vi.fn(), create: vi.fn(), copy: vi.fn(), cancelLoad: vi.fn()
}));
vi.mock('./rooms', () => ({ cloudConfigured: true, localServerConfigured: false, songbook: { pdfTitle: 'Book', pdfVersion: '1' }, RoomService: class {
  init = h.init; create = h.create; leave() {} roomCode() { return '123456'; }
  watch(_code: string, receive: unknown, status: any, error: unknown) { h.receive = receive; h.status = status; h.error = error; status('Connected'); }
  isMaster() { return false; } canControl() { return false; } participantId() { return 'follower'; } shouldFollow() { return true; }
} }));
vi.mock('./clipboard', () => ({ copyRoomUrl: vi.fn(), copyText: h.copy }));
vi.mock('./viewer', () => ({ SongbookViewer: class {
  count = 145; load = h.load; cancelLoad = h.cancelLoad; follow() {} cancelFollow() {} cancelGesture() {} destroy() {}
  position() { return { page: 1, offset: 0, zoom: 1 }; }
} }));
const flush = async () => { for (let n = 0; n < 40; n++) await Promise.resolve(); };
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('shows connection/download progress, copyable failures and retry, and rejects obsolete callbacks on navigation', async () => {
  vi.useFakeTimers(); h.init.mockResolvedValue(undefined); h.copy.mockResolvedValue(true);
  document.body.innerHTML = '<div id="app"></div>'; history.replaceState({}, '', '/?room=123456');
  await import('./main'); await flush();
  const connectionBar = document.querySelector('progress')!; expect(connectionBar.hasAttribute('value')).toBe(false);
  expect(document.querySelector('.room-loading')!.textContent).toContain('Connecting');
  await vi.advanceTimersByTimeAsync(30000);
  expect(document.querySelector('.room-recovery')!.textContent).toContain('room/connection-timeout');
  expect(document.querySelector('.copy-error')).not.toBeNull();
  (document.querySelector('.copy-error') as HTMLButtonElement).click(); await flush(); expect(h.copy.mock.calls[0][0]).toContain('Room: 123456');
  (document.querySelector('#retry-room') as HTMLButtonElement).click(); await flush();
  let reject!: (error: Error) => void;
  h.load.mockImplementationOnce(() => new Promise<void>((_yes, no) => { reject = no; }));
  const room: Room = { masterId: 'master', createdAt: Date.now(), expiresAt: Date.now() + 86400000, pdfUrl: '/book.pdf', pdfVersion: '1', pdfTitle: 'Book', position: { page: 1, offset: 0, zoom: 1, sequence: 1 } };
  h.receive(room); await flush(); const oldProgress = h.load.mock.calls[0][1]; oldProgress({ stage: 'download', loaded: 1e6, total: 2e6 });
  const pdfBar = document.querySelectorAll('progress')[1]; expect(pdfBar.value).toBe(.5); expect(document.querySelector('.room-loading')!.textContent).toContain('50%');
  h.status('Offline'); expect(document.querySelector('.room-loading')!.textContent).toContain('Offline'); expect(pdfBar.value).toBe(.5);
  h.status('Connected'); reject(Object.assign(new Error('PDF forbidden'), { name: 'UnexpectedResponseException', status: 403 })); await flush();
  const failure = document.querySelector('.room-recovery')!;
  expect(h.cancelLoad).toHaveBeenCalledTimes(2);
  expect(failure.textContent).toContain('UnexpectedResponseException'); expect(failure.textContent).toContain('HTTP status: 403'); expect(failure.textContent).toContain('document loading');
  h.load.mockResolvedValue(undefined); (document.querySelector('#retry-room') as HTMLButtonElement).click(); await flush(); h.receive(room); await flush();
  expect((document.querySelector('.room-loading') as HTMLElement).hidden).toBe(true);
  h.status('Offline'); await vi.advanceTimersByTimeAsync(30000);
  expect(document.querySelector('#notice')!.textContent).toContain('room/connection-timeout');
  expect((document.querySelector('.pdf-frame') as HTMLElement).hidden).toBe(false);
  h.status('Connected'); expect((document.querySelector('#notice') as HTMLElement).hidden).toBe(true);
  oldProgress({ stage: 'download', loaded: 0, total: 2e6 }); expect((document.querySelector('.room-loading') as HTMLElement).hidden).toBe(true);
  const oldError = h.error; history.replaceState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); await flush();
  oldError(Object.assign(new Error('late'), { code: 'permission-denied' })); await vi.advanceTimersByTimeAsync(60000); expect(document.querySelector('.room-recovery')).toBeNull();
  h.create.mockRejectedValueOnce(Object.assign(new Error('Creation failed'), { code: 'permission-denied' }));
  (document.querySelector('#create') as HTMLButtonElement).click(); await flush();
  expect(document.querySelector('#notice')!.textContent).toContain('permission-denied'); expect(document.querySelector('.copy-error')).not.toBeNull();
  history.replaceState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); await flush();
});
