// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import type { Room } from './model';
const h = vi.hoisted(() => ({ failViewer: true, failCleanup: false, init: vi.fn(), leave: vi.fn(), load: vi.fn(), receive: undefined as any, status: undefined as any, error: undefined as any }));
vi.mock('./rooms', () => ({ cloudConfigured: true, localServerConfigured: false, songbook: { pdfTitle: 'Book', pdfVersion: '1' }, RoomService: class {
  init = h.init; leave = h.leave; roomCode() { return '761483'; }
  watch(_code: string, receive: unknown, status: any, error: unknown) { h.receive = receive; h.status = status; h.error = error; status('Connected'); }
  isMaster() { return false; } canControl() { return false; } participantId() { return 'follower'; } shouldFollow() { return true; }
} }));
vi.mock('./viewer', () => ({ SongbookViewer: class {
  constructor() { if (h.failViewer) throw new TypeError('ResizeObserver is not a constructor'); }
  count = 145; load = h.load; follow() {} cancelFollow() { if (h.failCleanup) throw new Error('partial viewer cleanup failed'); } cancelGesture() {} destroy() {}
  position() { return { page: 1, offset: 0, zoom: 1 }; }
} }));
import { PdfScrollbar } from './scrollbar';
const flush = async () => { for (let n = 0; n < 50; n++) await Promise.resolve(); };
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('recovers from constructor failures before authentication, retries normally and handles missing AbortController', async () => {
  vi.useFakeTimers(); h.init.mockResolvedValue(undefined); h.load.mockResolvedValue(undefined);
  vi.spyOn(PdfScrollbar.prototype, 'destroy').mockImplementationOnce(() => { throw new Error('partial scrollbar cleanup failed'); });
  document.body.innerHTML = '<div id="app"></div>'; history.replaceState({}, '', '/?room=761483');
  await import('./main'); await flush();
  expect(document.querySelector('.startup-recovery')!.textContent).toContain('Stage: viewer setup');
  expect(document.querySelector('pre')!.textContent).toContain('ResizeObserver is not a constructor'); expect(h.init).not.toHaveBeenCalled();
  expect(h.leave).toHaveBeenCalledTimes(2); await vi.advanceTimersByTimeAsync(60000);
  expect(document.querySelector('.startup-recovery')!.textContent).not.toContain('Cannot access');
  h.failViewer = false; (document.querySelector('#retry-room') as HTMLButtonElement).click(); await flush();
  const room: Room = { masterId: 'other', createdAt: Date.now(), expiresAt: Date.now() + 86400000, pdfUrl: '/book.pdf', pdfVersion: '1', pdfTitle: 'Book', position: { page: 1, offset: 0, zoom: 1, sequence: 1 } };
  h.receive(room); await flush(); expect(document.querySelector('.startup-recovery')).toBeNull(); expect(document.querySelector('#pdf')!.classList.contains('locked')).toBe(true);
  const obsoleteError = h.error;
  vi.stubGlobal('AbortController', undefined); history.replaceState({}, '', '/?room=111111'); window.dispatchEvent(new PopStateEvent('popstate')); await flush();
  expect(document.querySelector('.startup-recovery')!.textContent).toContain('Stage: room interface setup');
  expect(document.querySelector('pre')!.textContent).toContain('AbortController');
  obsoleteError(new Error('obsolete subscription')); expect(document.querySelector('pre')!.textContent).not.toContain('obsolete subscription');
  vi.unstubAllGlobals(); (document.querySelector('#back-home') as HTMLButtonElement).click(); await flush();
  expect(document.querySelector('.home')).not.toBeNull(); expect(document.querySelector('.startup-recovery')).toBeNull();
  h.failCleanup = true; h.init.mockRejectedValueOnce(Object.assign(new Error('Authentication network failure'), { code: 'auth/network-request-failed' }));
  history.replaceState({}, '', '/?room=222222'); window.dispatchEvent(new PopStateEvent('popstate')); await flush();
  expect(document.querySelector('.startup-recovery')!.textContent).toContain('auth/network-request-failed');
  expect(document.querySelector('pre')!.textContent).not.toContain('partial viewer cleanup failed');
  h.failCleanup = false; (document.querySelector('#back-home') as HTMLButtonElement).click(); await flush();
});
