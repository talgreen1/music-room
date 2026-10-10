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
