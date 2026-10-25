import type { Position } from './model';
import { recordSyncDiagnostic } from './sync-diagnostics';

/** Hold ordinary remote positions until a local pinch's final write settles. */
export class ControllerPinch {
  private active = false;
  private settling = false;
  private revision = 0;
  get blocked() { return this.active || this.settling; }
  start() { this.revision++; this.active = true; this.settling = false; recordSyncDiagnostic({ event: 'pinch-start' }); }
  finish(position: Position, send: (position: Position) => Promise<boolean>) {
    if (!this.active) return;
    this.active = false; this.settling = true;
    const revision = this.revision;
    recordSyncDiagnostic({ event: 'pinch-final', page: position.page, zoom: position.zoom });
    void send(position).then(success => {
      if (this.revision !== revision) return;
      this.settling = false;
      recordSyncDiagnostic({ event: 'pinch-settled', reason: success ? 'saved' : 'not-saved' });
    }, () => { if (this.revision === revision) this.settling = false; });
  }
  reset() { this.revision++; this.active = this.settling = false; }
}
