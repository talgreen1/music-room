/** Opt-in, bounded diagnostics: no credentials, URLs or document text. */
import { appendDiagnostic, diagnosticEvents, geometryKeys, validPinchGeometry, type PinchGeometry, type SyncDiagnostic } from './diagnostic-report';
export type { SyncDiagnostic } from './diagnostic-report';
const listeners = new Set<(event: SyncDiagnostic) => void>();
export const diagnosticUploadsEnabled = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('syncDebug') === '1';
export function subscribeSyncDiagnostics(listener: (event: SyncDiagnostic) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
declare global { interface Window { musicRoomSyncDiagnostics?: SyncDiagnostic[] } }
export function recordSyncDiagnostic(event: Omit<SyncDiagnostic, 'at'>) {
  if (!diagnosticUploadsEnabled() || !diagnosticEvents.includes(event.event)) return;
  const entries = window.musicRoomSyncDiagnostics ||= [];
  const entry: SyncDiagnostic = { event: event.event, at: Date.now(), ...(event.page === undefined ? {} : { page: event.page }), ...(event.zoom === undefined ? {} : { zoom: event.zoom }), ...(event.sequence === undefined ? {} : { sequence: event.sequence }), ...(event.reason === undefined ? {} : { reason: event.reason }) };
  if (event.geometry && ['pinch-layout','pinch-frame'].includes(event.event)) {
    const geometry = Object.fromEntries(geometryKeys.map(key => [key, event.geometry![key]])) as PinchGeometry;
    if (validPinchGeometry(geometry)) entry.geometry = geometry;
  }
  appendDiagnostic(entries, entry);
  console.debug('[Music Room sync]', entries[entries.length - 1]);
  listeners.forEach(listener => { try { listener(entry); } catch { /* Debugging never interrupts the room. */ } });
}
