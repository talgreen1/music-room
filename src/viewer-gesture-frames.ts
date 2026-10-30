import { clampZoom } from './model';
import type { Point } from './gestures';

/** Coalesce pointer bursts without losing scale, midpoint travel or the final write. */
export class ViewerGestureFrames {
  private frame = 0;
  private pending?: { kind: 'zoom'; value: number; from: Point; to: Point } | { kind: 'pan'; dx: number; dy: number };
  constructor(private currentZoom: () => number, private applyZoom: (value: number, from: Point, to: Point) => void, private applyPan: (dx: number, dy: number) => void) {}
  zoom(factor: number, from: Point, to: Point) {
    if (this.pending?.kind === 'pan') this.flush();
    const previous = this.pending?.kind === 'zoom' ? this.pending : undefined;
    this.pending = { kind: 'zoom', value: clampZoom((previous?.value ?? this.currentZoom()) * factor), from: previous?.from ?? from, to };
    this.schedule();
  }
  pan(dx: number, dy: number) {
    if (this.pending?.kind === 'zoom') this.flush();
    const previous = this.pending?.kind === 'pan' ? this.pending : undefined;
    this.pending = { kind: 'pan', dx: (previous?.dx ?? 0) + dx, dy: (previous?.dy ?? 0) + dy };
    this.schedule();
  }
  private schedule() { if (!this.frame) this.frame = requestAnimationFrame(() => this.flush()); }
  flush() {
    cancelAnimationFrame(this.frame); this.frame = 0;
    const pending = this.pending; this.pending = undefined;
    if (pending?.kind === 'zoom') this.applyZoom(pending.value, pending.from, pending.to);
    else if (pending) this.applyPan(pending.dx, pending.dy);
  }
  cancel() { cancelAnimationFrame(this.frame); this.frame = 0; this.pending = undefined; }
}
