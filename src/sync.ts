import type { Position } from './model';

/** At most one write in flight; retain only the newest pending position. */
export class PositionPublisher {
  private pending?: Position;
  private timer?: ReturnType<typeof setTimeout>;
  private busy = false;
  private lastSent = -Infinity;
  private active = true;
  constructor(private send: (position: Position) => Promise<void>, private onError: (error: unknown) => void, private interval = 1000 / 15) {}
  push(position: Position, immediate = false) {
    if (!this.active) return;
    this.pending = position;
    if (this.busy) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), immediate ? 0 : Math.max(0, this.interval - (performance.now() - this.lastSent)));
  }
  private async flush() {
    if (!this.pending || !this.active || this.busy) return;
    const position = this.pending; this.pending = undefined; this.busy = true; this.lastSent = performance.now();
    try { await this.send(position); } catch (error) { this.onError(error); }
    finally { this.busy = false; if (this.pending && this.active) this.push(this.pending); }
  }
  stop() { this.active = false; this.pending = undefined; clearTimeout(this.timer); }
}
