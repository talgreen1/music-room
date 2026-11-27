// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ copy: vi.fn() }));
vi.mock('./clipboard', () => ({ copyText: h.copy }));
import { beginStartup, type StartupGuard } from './startup';
let startup: StartupGuard;
beforeEach(() => { vi.useFakeTimers(); h.copy.mockReset().mockResolvedValue(true); document.body.innerHTML = '<div id="app"></div>'; });
afterEach(() => { startup?.dispose(); document.body.replaceChildren(); delete window.musicRoomStartupDiagnostics; vi.useRealTimers(); vi.unstubAllGlobals(); });
function fixture(cancel = vi.fn()) {
  const root = document.querySelector<HTMLElement>('#app')!, retry = vi.fn(), home = vi.fn();
  startup = beginStartup(root, { room: '761483', backend: 'Firebase', cancel, retry, home });
  return { root, cancel, retry, home };
}
it('renders independent, copyable recovery before Firebase and despite failed component cleanup', async () => {
  vi.stubGlobal('AbortController', undefined); vi.stubGlobal('ResizeObserver', undefined);
  const t = fixture(vi.fn(() => { throw new Error('partial teardown failed'); }));
  startup.enter('viewer setup'); startup.protect(() => { throw new TypeError('ResizeObserver is not a constructor'); });
  expect(t.root.textContent).toContain('Could not start Music Room'); expect(t.root.textContent).toContain('Stage: viewer setup');
  expect(t.root.textContent).toContain('Startup trace:'); expect(t.root.textContent).toContain('cleanup failed');
  const report = t.root.querySelector('pre')!.textContent;
  (t.root.querySelector('.copy-error') as HTMLButtonElement).click(); await Promise.resolve();
  expect(h.copy).toHaveBeenCalledWith(report, expect.any(HTMLElement), 'Error details to copy');
  expect(report).toContain('Room: 761483'); expect(t.root.textContent).toContain('Error copied.');
  (t.root.querySelector('#retry-room') as HTMLButtonElement).click(); expect(t.retry).toHaveBeenCalledOnce();
  (t.root.querySelector('#back-home') as HTMLButtonElement).click(); expect(t.home).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(60000); expect(t.cancel).toHaveBeenCalledOnce();
});
it('bounds a stalled startup and records elapsed stages without needing storage or a room subscription', async () => {
  const t = fixture(); startup.enter('application module loading'); await vi.advanceTimersByTimeAsync(10000);
  startup.enter('participant identity setup'); await vi.advanceTimersByTimeAsync(30000);
  expect(t.root.textContent).toContain('app/startup-timeout'); expect(t.root.textContent).toContain('+10000ms participant identity setup');
  expect(window.musicRoomStartupDiagnostics!.at(-1)!.stage).toBe('startup failed');
});
it('captures otherwise unhandled startup failures and detaches global handlers once ready', () => {
  const t = fixture(); startup.enter('authentication');
  const event = Object.assign(new Event('unhandledrejection', { cancelable: true }), { reason: Object.assign(new Error('early failure'), { code: 'test/early' }) });
  window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true); expect(t.root.textContent).toContain('test/early');
  const next = fixture(); startup.complete();
  window.dispatchEvent(new ErrorEvent('error', { error: new Error('after ready'), message: 'after ready' }));
  expect(next.root.textContent).not.toContain('after ready'); expect(next.cancel).not.toHaveBeenCalled();
});
it('discards obsolete attempts, cleans timers and bounds diagnostic history', async () => {
  const first = fixture(), old = startup; const second = fixture();
  old.fail(new Error('late old-room error')); old.protect(() => { throw new Error('late callback'); });
  expect(first.cancel).not.toHaveBeenCalled();
  for (let n = 0; n < 70; n++) startup.enter(`stage ${n}`);
  expect(window.musicRoomStartupDiagnostics).toHaveLength(40);
  startup.dispose(); await vi.advanceTimersByTimeAsync(60000); expect(second.cancel).not.toHaveBeenCalled();
});
