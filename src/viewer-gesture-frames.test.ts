import { afterEach, expect, it, vi } from 'vitest';
import { ViewerGestureFrames } from './viewer-gesture-frames';
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const frames = new Map<number, FrameRequestCallback>(); let id = 0, zoom = 1;
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { frames.set(++id, callback); return id; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn(frame => frames.delete(frame)));
  const applyZoom = vi.fn(value => { zoom = value; }), pan = vi.fn();
  return { input: new ViewerGestureFrames(() => zoom, applyZoom, pan), applyZoom, pan,
    paint: () => { const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback(0)); }, frames };
}
it('coalesces scale and midpoint movement into one update per display frame', () => {
  const { input, applyZoom, paint, frames } = fixture();
  input.zoom(1.5, { x: 10, y: 20 }, { x: 20, y: 30 });
  input.zoom(2, { x: 20, y: 30 }, { x: 30, y: 50 });
  expect(applyZoom).not.toHaveBeenCalled(); expect(frames.size).toBe(1); paint();
  expect(applyZoom).toHaveBeenCalledExactlyOnceWith(3, { x: 10, y: 20 }, { x: 30, y: 50 });
  input.zoom(.5, { x: 30, y: 50 }, { x: 40, y: 60 }); input.flush();
  expect(applyZoom).toHaveBeenLastCalledWith(1.5, { x: 30, y: 50 }, { x: 40, y: 60 });
  expect(frames.size).toBe(0);
});
it('preserves sequential clamping and reversals at min/max zoom', () => {
  const { input, applyZoom, paint } = fixture();
  input.zoom(10, { x: 0, y: 0 }, { x: 0, y: 0 }); input.zoom(.5, { x: 0, y: 0 }, { x: 0, y: 0 }); paint();
  expect(applyZoom).toHaveBeenLastCalledWith(2, expect.anything(), expect.anything());
  input.zoom(.01, { x: 0, y: 0 }, { x: 0, y: 0 }); input.zoom(2, { x: 0, y: 0 }, { x: 0, y: 0 }); paint();
  expect(applyZoom).toHaveBeenLastCalledWith(1.5, expect.anything(), expect.anything());
});
it('coalesces pans, flushes transitions in order and discards canceled source/role input', () => {
  const { input, applyZoom, pan, paint } = fixture();
  input.pan(2, 3); input.pan(4, -1); input.zoom(2, { x: 0, y: 0 }, { x: 1, y: 1 });
  expect(pan).toHaveBeenCalledExactlyOnceWith(6, 2);
  input.pan(1, 1); expect(applyZoom).toHaveBeenCalledOnce();
  expect(pan.mock.invocationCallOrder[0]).toBeLessThan(applyZoom.mock.invocationCallOrder[0]);
  input.cancel(); paint(); expect(pan).toHaveBeenCalledOnce();
  input.zoom(2, { x: 0, y: 0 }, { x: 1, y: 1 }); input.cancel(); input.flush();
  expect(applyZoom).toHaveBeenCalledOnce();
});
