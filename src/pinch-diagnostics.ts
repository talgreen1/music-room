import { diagnosticUploadsEnabled, recordSyncDiagnostic } from './sync-diagnostics';
import type { SyncDiagnostic } from './diagnostic-report';

type Snapshot = () => Pick<SyncDiagnostic, 'page' | 'zoom' | 'geometry'>;
/** Measure immediately and two animation frames later; never correct or publish positions. */
export class PinchDiagnostics {
  private frame = 0;
  private lastAt = -Infinity;
  private latest?: Snapshot;
  sample(snapshot: Snapshot, final = false) {
    if (!diagnosticUploadsEnabled()) return;
    this.latest = snapshot;
    // A newer pointer movement invalidates the older frame comparison.
    cancelAnimationFrame(this.frame); this.frame = 0;
    if (!final && performance.now() - this.lastAt < 250) return;
    this.lastAt = performance.now();
    recordSyncDiagnostic({ event: 'pinch-layout', ...snapshot() });
    this.frame = requestAnimationFrame(() => {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        if (diagnosticUploadsEnabled()) recordSyncDiagnostic({ event: 'pinch-frame', ...snapshot() });
      });
    });
  }
  finish() { if (this.latest) this.sample(this.latest, true); this.latest = undefined; }
  cancel() { cancelAnimationFrame(this.frame); this.frame = 0; this.latest = undefined; this.lastAt = -Infinity; }
}
