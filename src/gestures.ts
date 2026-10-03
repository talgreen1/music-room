export interface Point { x: number; y: number }
interface Callbacks {
  locked: () => boolean;
  pan: (dx: number, dy: number) => void;
  zoom: (factor: number, from: Point, to: Point) => void;
  start: () => void;
  end: () => void;
}

/** Own gestures inside the PDF only; browser/UI zoom elsewhere remains available. */
export class PdfGestures {
  private pointers = new Map<number, Point>();
  private events = new AbortController();
  constructor(private host: HTMLElement, private callbacks: Callbacks) {
    const options = { signal: this.events.signal };
    host.addEventListener('pointerdown', event => {
      const target = event.target as HTMLElement;
      if (typeof target.closest === 'function' && target.closest('button, input, a')) return;
      if (callbacks.locked() || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      if (!this.pointers.size) callbacks.start();
      this.pointers.set(event.pointerId, this.point(event));
      host.setPointerCapture(event.pointerId);
      host.classList.add('dragging');
    }, options);
    host.addEventListener('pointermove', event => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) return;
      event.preventDefault();
      if (callbacks.locked()) { this.clear(); return; }
      const before = this.pair();
      const current = this.point(event);
      this.pointers.set(event.pointerId, current);
      const after = this.pair();
      if (before && after) {
        const distance = (pair: Point[]) => Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
        const center = (pair: Point[]) => ({ x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 });
        const oldDistance = distance(before);
        if (oldDistance > 0) callbacks.zoom(distance(after) / oldDistance, center(before), center(after));
      } else callbacks.pan(previous.x - current.x, previous.y - current.y);
    }, options);
    const finish = (event: PointerEvent) => {
      if (!this.pointers.delete(event.pointerId)) return;
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      if (!this.pointers.size) { host.classList.remove('dragging'); callbacks.end(); }
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) host.addEventListener(name, finish, options);
    host.addEventListener('wheel', event => {
      // Trackpad pinches and Ctrl+wheel arrive as wheel events in desktop browsers.
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (callbacks.locked()) return;
      callbacks.start();
      const point = this.point(event);
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host.clientHeight : 1);
      callbacks.zoom(Math.exp(-delta * 0.005), point, point);
      callbacks.end();
    }, { ...options, passive: false });
    // Safari can also emit native gesture events; the PDF handles its own zoom.
    for (const name of ['gesturestart', 'gesturechange']) host.addEventListener(name, event => event.preventDefault(), { ...options, passive: false });
  }
  private point(event: MouseEvent): Point {
    const bounds = this.host.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }
  private pair() { return this.pointers.size > 1 ? Array.from(this.pointers.values()).slice(0, 2) : undefined; }
  private clear() {
    const ids = [...this.pointers.keys()]; this.pointers.clear();
    for (const id of ids) if (this.host.hasPointerCapture(id)) this.host.releasePointerCapture(id);
    this.host.classList.remove('dragging'); this.callbacks.end();
  }
  destroy() { this.events.abort(); this.clear(); }
}
