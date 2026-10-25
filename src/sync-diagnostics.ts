/** Opt-in, bounded diagnostics: no credentials, room codes, URLs or document text. */
export interface SyncDiagnostic { event: string; at: number; page?: number; zoom?: number; sequence?: number; reason?: string }
declare global { interface Window { musicRoomSyncDiagnostics?: SyncDiagnostic[] } }
export function recordSyncDiagnostic(event: Omit<SyncDiagnostic, 'at'>) {
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('syncDebug') !== '1') return;
  const entries = window.musicRoomSyncDiagnostics ||= [];
  entries.push({ ...event, at: Date.now() });
  if (entries.length > 50) entries.splice(0, entries.length - 50);
  console.debug('[Music Room sync]', entries[entries.length - 1]);
}
