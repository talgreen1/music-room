// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ callbacks: undefined as any }));
vi.mock('./gestures', () => ({ PdfGestures: class {
  constructor(_host: HTMLElement, callbacks: unknown) { h.callbacks = callbacks; }
  cancel() { h.callbacks.end(); h.callbacks.pinchEnd(); }
  destroy() {}
} }));
import { SongbookViewer } from './viewer';
it('does not emit an obsolete local position when a source/permission/reconnect cancels a pinch', () => {
  const host = document.createElement('div'), viewer = new SongbookViewer(host);
  Object.assign(viewer, { pages: [{ offsetTop: 0, offsetHeight: 1000 }], zoom: 1 });
  const changed = vi.fn(), finished = vi.fn(); viewer.onPosition = changed; viewer.onPinchEnd = finished;
  h.callbacks.end(); expect(changed).toHaveBeenCalledOnce(); changed.mockClear();
  viewer.cancelGesture(); expect(changed).not.toHaveBeenCalled(); expect(finished).toHaveBeenCalledOnce();
  viewer.destroy();
});
