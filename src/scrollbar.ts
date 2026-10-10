/** A persistent, touch-friendly scrollbar for the locally rendered PDF. */
export class PdfScrollbar {
  readonly element = document.createElement('div');
  private thumb = document.createElement('div');
  private events = new AbortController();
  private resize: ResizeObserver;
  private enabled = false;
  private drag?: { id: number; grab: number };
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  onScroll?: () => void;
  constructor(private host: HTMLElement) {
    this.element.className = 'pdf-scrollbar'; this.thumb.className = 'pdf-scrollbar-thumb';
    this.element.append(this.thumb);
    this.element.setAttribute('role', 'scrollbar');
    this.element.setAttribute('aria-label', 'Scroll through songbook');
    this.element.setAttribute('aria-controls', host.id);
    this.element.setAttribute('aria-orientation', 'vertical');
    this.element.setAttribute('aria-valuemin', '0'); this.element.setAttribute('aria-valuemax', '100');
    const options = { signal: this.events.signal };
    host.addEventListener('scroll', () => this.refresh(), { ...options, passive: true });
    this.resize = new ResizeObserver(() => this.refresh());
    this.resize.observe(host); this.resize.observe(this.element);
    this.element.addEventListener('pointerdown', event => {
      if (!this.enabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (this.drag) return;
      event.preventDefault();
      this.onInteractionStart?.();
      const track = this.element.getBoundingClientRect();
      const thumb = this.thumb.getBoundingClientRect();
      const grab = event.target === this.thumb ? event.clientY - thumb.top : thumb.height / 2;
      this.drag = { id: event.pointerId, grab };
      this.element.setPointerCapture(event.pointerId);
      this.move(event.clientY - track.top - grab);
    }, options);
    this.element.addEventListener('pointermove', event => {
      if (!this.enabled || this.drag?.id !== event.pointerId) return;
      event.preventDefault();
      this.move(event.clientY - this.element.getBoundingClientRect().top - this.drag.grab);
    }, options);
    const finish = (event: PointerEvent) => {
      if (this.drag?.id !== event.pointerId) return;
      this.drag = undefined;
      if (this.element.hasPointerCapture(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
      this.onInteractionEnd?.();
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.element.addEventListener(name, finish, options);
    this.element.addEventListener('keydown', event => {
      if (!this.enabled) return;
      const top = this.host.scrollTop;
      const positions: Record<string, number> = {
        ArrowUp: top - 60, ArrowDown: top + 60,
        PageUp: top - this.host.clientHeight, PageDown: top + this.host.clientHeight,
        Home: 0, End: this.host.scrollHeight - this.host.clientHeight
      };
      if (!(event.key in positions)) return;
      event.preventDefault(); this.onInteractionStart?.(); this.host.scrollTop = positions[event.key]; this.refresh(); this.onInteractionEnd?.();
    }, options);
    this.setEnabled(false);
  }
  private move(top: number) {
    this.onScroll?.();
    const travel = this.element.clientHeight - this.thumb.offsetHeight;
    const percent = Math.max(0, Math.min(1, top / Math.max(1, travel)));
    this.host.scrollTop = percent * Math.max(0, this.host.scrollHeight - this.host.clientHeight);
    this.refresh();
  }
  refresh() {
    const height = this.element.clientHeight;
    const thumbHeight = Math.min(height, Math.max(48, height * this.host.clientHeight / Math.max(1, this.host.scrollHeight)));
    const max = Math.max(0, this.host.scrollHeight - this.host.clientHeight);
    const percent = max ? Math.max(0, Math.min(1, this.host.scrollTop / max)) : 0;
    this.thumb.style.height = `${thumbHeight}px`;
    this.thumb.style.top = `${percent * (height - thumbHeight)}px`;
    this.element.setAttribute('aria-valuenow', String(Math.round(percent * 100)));
  }
  setEnabled(value: boolean) {
    this.enabled = value; this.element.tabIndex = value ? 0 : -1;
    this.element.setAttribute('aria-disabled', String(!value));
    if (!value && this.drag) {
      const id = this.drag.id; this.drag = undefined;
      if (this.element.hasPointerCapture(id)) this.element.releasePointerCapture(id);
      this.onInteractionEnd?.();
    }
    this.refresh();
  }
  destroy() { this.events.abort(); this.resize.disconnect(); this.element.remove(); }
}
