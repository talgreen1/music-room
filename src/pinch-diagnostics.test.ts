// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { PinchDiagnostics } from './pinch-diagnostics';

afterEach(() => { history.replaceState({}, '', '/'); delete window.musicRoomSyncDiagnostics; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function fixture() {
  const frames = new Map<number, FrameRequestCallback>(); let id = 0, now = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { frames.set(++id, callback); return id; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn(frame => frames.delete(frame)));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  return { trace: new PinchDiagnostics(), advance: (value: number) => { now = value; }, paint: () => { const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback(now)); }, frames };
}
it('does no measuring or scheduling without opt-in', () => {
  const { trace } = fixture(), snapshot = vi.fn(); trace.sample(snapshot); trace.finish();
  expect(snapshot).not.toHaveBeenCalled(); expect(requestAnimationFrame).not.toHaveBeenCalled();
});
it('captures immediate versus delayed page movement, samples at most every 250ms and always captures the final target', () => {
  history.replaceState({}, '', '/?syncDebug=1');
  const { trace, paint, advance } = fixture(); let page = 113;
  const snapshot = () => ({ page, zoom: 1 });
  trace.sample(snapshot); page = 257; paint(); expect(window.musicRoomSyncDiagnostics).toHaveLength(1); paint();
  expect(window.musicRoomSyncDiagnostics).toEqual([expect.objectContaining({ event: 'pinch-layout', page: 113 }), expect.objectContaining({ event: 'pinch-frame', page: 257 })]);
  advance(100); trace.sample(snapshot); expect(window.musicRoomSyncDiagnostics).toHaveLength(2);
  trace.finish(); expect(window.musicRoomSyncDiagnostics).toHaveLength(3); paint(); paint();
  expect(window.musicRoomSyncDiagnostics).toHaveLength(4);
  advance(400); trace.sample(snapshot); paint(); trace.cancel(); paint();
  expect(window.musicRoomSyncDiagnostics).toHaveLength(5);
});
it('cancels pending measurements on source/follow changes and resets sampling for a new gesture', () => {
  history.replaceState({}, '', '/?syncDebug=1');
  const { trace, paint, frames } = fixture(); trace.sample(() => ({ page: 1 })); trace.cancel(); paint(); paint(); trace.finish();
  expect(frames.size).toBe(0); expect(window.musicRoomSyncDiagnostics).toHaveLength(1);
  trace.sample(() => ({ page: 2 })); expect(window.musicRoomSyncDiagnostics).toHaveLength(2);
});
it('does not compare an old target after a newer pointer movement inside the throttle interval', () => {
  history.replaceState({}, '', '/?syncDebug=1');
  const { trace, advance, paint } = fixture(); trace.sample(() => ({ page: 113 })); paint();
  advance(20); trace.sample(() => ({ page: 114 })); paint();
  expect(window.musicRoomSyncDiagnostics).toHaveLength(1);
  trace.finish(); paint(); paint();
  expect(window.musicRoomSyncDiagnostics!.slice(1).map(entry => entry.page)).toEqual([114, 114]);
});
