import type { Position } from './model';

/** At most one write in flight; retain only the newest pending position. */
export class PositionPublisher {
  private pending?: Position;
  private timer?: ReturnType<typeof setTimeout>;
  private busy = false;
  private lastSent = -Infinity;
  private active = true;
  private finalWaiters: ((success: boolean) => void)[] = [];
  constructor(private send: (position: Position) => Promise<void>, private onError: (error: unknown) => void, private interval = 1000 / 15) {}
  push(position: Position, immediate = false) {
    if (!this.active) return;
    this.pending = position;
    if (this.busy) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), immediate ? 0 : Math.max(0, this.interval - (performance.now() - this.lastSent)));
  }
  finish(position: Position): Promise<boolean> {
    if (!this.active) return Promise.resolve(false);
    return new Promise(resolve => { this.finalWaiters.push(resolve); this.push(position, true); });
  }
  private async flush() {
    if (!this.pending || !this.active || this.busy) return;
    const position = this.pending, waiters = this.finalWaiters.splice(0); this.pending = undefined; this.busy = true; this.lastSent = performance.now();
    let success = false;
    try { await this.send(position); success = true; } catch (error) { this.onError(error); }
    finally { waiters.forEach(resolve => resolve(success && this.active)); this.busy = false; if (this.pending && this.active) this.push(this.pending, this.finalWaiters.length > 0); }
  }
  stop() { this.active = false; this.pending = undefined; clearTimeout(this.timer); this.finalWaiters.splice(0).forEach(resolve => resolve(false)); }
}
