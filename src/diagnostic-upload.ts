import { appendDiagnostic, DIAGNOSTIC_RETENTION, validateDiagnosticReport, type DiagnosticReport, type SyncDiagnostic } from './diagnostic-report';
import { diagnosticUploadsEnabled, recordSyncDiagnostic, subscribeSyncDiagnostics } from './sync-diagnostics';

/** Best-effort snapshots, at most one write in flight and 120 attempts/session. */
export function startDiagnosticUpload(roomCreatedAt: number, send: (report: DiagnosticReport) => Promise<void>, now = Date.now) {
  if (!diagnosticUploadsEnabled()) return () => {};
  const createdAt = now(), entries: SyncDiagnostic[] = [];
  const ua = navigator.userAgent;
  const platform = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : /Android/i.test(ua) ? 'android' : 'other';
  const browser = /CriOS|Chrome\//i.test(ua) ? 'chrome' : /Safari\//i.test(ua) ? 'safari' : 'other';
  let alive = true, busy = false, revision = 0, savedRevision = 0, batch = 0, attempts = 0, lastAttempt = createdAt;
  const unsubscribe = subscribeSyncDiagnostics(entry => { appendDiagnostic(entries, entry); revision++; });
  const flush = async () => {
    if (!alive || !diagnosticUploadsEnabled() || busy || attempts >= 120 || revision === savedRevision || now() - lastAttempt < 5000) return;
    busy = true; attempts++; lastAttempt = now(); const sendingRevision = revision;
    try {
      await send(validateDiagnosticReport({ roomCreatedAt, createdAt, updatedAt: now(), expiresAt: createdAt + DIAGNOSTIC_RETENTION, batch: batch + 1, platform, browser, events: entries.slice() }));
      if (alive) { batch++; savedRevision = sendingRevision; }
    } catch { /* Keep the newest local events; retry only on a later bounded tick. */ }
    finally { busy = false; }
  };
  const timer = window.setInterval(() => void flush(), 5000);
  const hidden = () => { if (document.visibilityState === 'hidden') void flush(); };
  document.addEventListener('visibilitychange', hidden);
  recordSyncDiagnostic({ event: 'session-start' });
  return () => { alive = false; window.clearInterval(timer); unsubscribe(); document.removeEventListener('visibilitychange', hidden); };
}
