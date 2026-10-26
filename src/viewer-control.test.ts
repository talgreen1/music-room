import { afterEach, describe, expect, it, vi } from 'vitest';
import { SongbookViewer } from './viewer';

// Exercise real coordinate/follow methods with fixed geometry, without a canvas.
function fixture() {
  const viewer = Object.create(SongbookViewer.prototype);
  Object.assign(viewer, {
    pages: [{ offsetTop: 0, offsetHeight: 1000 }], zoom: 1, frame: 0,
    host: { scrollTop: 0, scrollLeft: 0, scrollHeight: 1000, clientHeight: 200, scrollWidth: 1000, clientWidth: 200 },
    onPosition: vi.fn(), onPage: vi.fn(), geometry: () => ({ tops: [0], heights: [1000] })
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  return viewer as SongbookViewer & { onPosition: ReturnType<typeof vi.fn>; onPage: ReturnType<typeof vi.fn> };
}
afterEach(() => vi.unstubAllGlobals());
describe('shared controller view updates', () => {
  it('keeps a fixed pinch anchor despite intermediate scroll clamping during layout', () => {
    const viewer = fixture(), state = viewer as any;
    const page = { offsetTop: 0, offsetLeft: 0, get offsetWidth() { return 1000 * state.zoom; }, get offsetHeight() { return 1000 * state.zoom; } };
    state.pages = [page]; state.pinching = true; state.host.scrollTop = 400; state.host.scrollLeft = 200;
    state.geometry = () => ({ tops: [0], heights: [page.offsetHeight] });
    state.layout = () => { state.host.scrollHeight = page.offsetHeight; state.host.scrollWidth = page.offsetWidth; };
    state.pinchDiagnostics = { sample: vi.fn() };
    state.zoomAt(2, { x: 100, y: 100 }, { x: 100, y: 100 });
    expect(state.host.scrollTop).toBe(900); expect(state.host.scrollLeft).toBe(500);
    const snapshot = state.pinchDiagnostics.sample.mock.calls[0][0];
    expect(snapshot().geometry).toMatchObject({ anchorPage: 1, anchorOffset: .5, beforeTop: 400, targetTop: 900, actualTop: 900, targetLeft: 500 });
    state.host.scrollTop = 1700;
    expect(snapshot().geometry).toMatchObject({ targetTop: 900, actualTop: 1700 });
    // Simulate stale/clamped scroll pixels seen between iOS layout/event turns.
    state.host.scrollTop = 0; state.host.scrollLeft = 0;
    state.zoomAt(3, { x: 100, y: 100 }, { x: 120, y: 150 });
    expect(state.host.scrollTop).toBe(1350); expect(state.host.scrollLeft).toBe(780);
    expect(viewer.onPosition).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 3, offset: .45 }), false);
  });
  it('applies zoom-out and its page/axis coordinates together without crossing unrelated pages', () => {
    const viewer = fixture(), state = viewer as any;
    const raf = vi.fn(); vi.stubGlobal('requestAnimationFrame', raf);
    state.zoom = 2; state.pages = [{}, {}]; state.host.scrollTop = 2500; state.host.scrollLeft = 1200;
    state.geometry = () => ({ tops: [0, 1000 * state.zoom], heights: [1000 * state.zoom, 1000 * state.zoom] });
    state.layout = () => { state.host.scrollHeight = 2000 * state.zoom; state.host.scrollWidth = 1000 * state.zoom; };
    viewer.follow({ page: 2, offset: .25, zoom: 1, horizontal: .75 }, false, true);
    expect(state.host.scrollTop).toBe(1250); expect(state.host.scrollLeft).toBe(600);
    expect(viewer.onPage).toHaveBeenLastCalledWith(2);
    expect(viewer.onPosition).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, offset: .25, zoom: 1, horizontal: .75 }), true);
    expect(raf).not.toHaveBeenCalled();
    viewer.follow({ page: 2, offset: .25, zoom: 2, horizontal: 1 }, false, true);
    expect(state.host.scrollTop).toBe(2500); expect(state.host.scrollLeft).toBe(1800);
    expect(raf).not.toHaveBeenCalled();
  });
  it('keeps interpolation for same-zoom scrolling and cancels it when zoom changes', () => {
    const viewer = fixture(), state = viewer as any;
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42));
    state.layout = vi.fn();
    viewer.follow({ page: 1, offset: .6, zoom: 1 }, false, true);
    expect(state.host.scrollTop).toBe(0); expect(requestAnimationFrame).toHaveBeenCalledOnce();
    viewer.follow({ page: 1, offset: .4, zoom: 1.5 }, false, true);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(state.host.scrollTop).toBe(400); expect(state.target).toBeUndefined();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
  });
  it('marks incoming positions and delayed scroll events remote, preventing rebroadcast', () => {
    const viewer = fixture();
    viewer.follow({ page: 1, offset: .4, horizontal: .8, zoom: 1 }, true, true);
    expect(viewer.onPosition).toHaveBeenLastCalledWith(expect.objectContaining({ offset: .4, horizontal: .8 }), true);
    (viewer as any).emitPosition();
    expect(viewer.onPosition).toHaveBeenLastCalledWith(expect.anything(), true);
    expect(viewer.onPage).toHaveBeenCalledWith(1);
  });
  it('resumes local publishing when a controller interacts after a remote update', () => {
    const viewer = fixture();
    viewer.follow({ page: 1, offset: .4, zoom: 1 }, true, true);
    viewer.cancelFollow(); (viewer as any).host.scrollTop = 500; (viewer as any).emitPosition();
    expect(viewer.onPosition).toHaveBeenLastCalledWith(expect.objectContaining({ offset: .5 }), false);
  });
  it('explicit local navigation publishes even when the previous position was remote', () => {
    const viewer = fixture();
    viewer.follow({ page: 1, offset: .4, zoom: 1 }, true, true);
    viewer.follow({ page: 1, offset: .2, zoom: 1 }, true);
    expect(viewer.onPosition).toHaveBeenLastCalledWith(expect.objectContaining({ offset: .2 }), false);
  });
});
