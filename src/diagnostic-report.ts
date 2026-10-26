export const diagnosticEvents = ['session-start', 'pinch-start', 'pinch-final', 'pinch-settled', 'remote-deferred', 'position-write-failed', 'pinch-layout', 'pinch-frame'] as const;
export const geometryKeys = ['anchorPage', 'anchorOffset', 'anchorTop', 'anchorHeight', 'beforeTop', 'targetTop', 'actualTop', 'targetLeft', 'actualLeft', 'scrollHeight', 'viewportHeight'] as const;
export type PinchGeometry = Record<typeof geometryKeys[number], number>;
export type DiagnosticEvent = typeof diagnosticEvents[number];
export interface SyncDiagnostic { event: DiagnosticEvent; at: number; page?: number; zoom?: number; sequence?: number; geometry?: PinchGeometry; reason?: 'saved' | 'not-saved' | 'maxretry' | 'write-failed' }
/** Keep detailed snapshots below the local HTTP body limit alongside lifecycle events. */
export function appendDiagnostic(entries: SyncDiagnostic[], entry: SyncDiagnostic) {
  entries.push(entry);
  while (entries.filter(value => value.geometry).length > 12) entries.splice(entries.findIndex(value => value.geometry), 1);
  if (entries.length > 50) entries.splice(0, entries.length - 50);
}
export function validPinchGeometry(value: PinchGeometry) {
  return value && exact(value, [...geometryKeys]) && geometryKeys.every(key => Number.isFinite(value[key]) && Math.abs(value[key]) <= 1e9) &&
    Number.isInteger(value.anchorPage) && value.anchorPage >= 1 && value.anchorPage <= 10000 && value.anchorOffset >= 0 && value.anchorOffset <= 1 &&
    value.anchorTop >= 0 && value.anchorHeight > 0 && value.scrollHeight >= 0 && value.viewportHeight >= 0;
}
export interface DiagnosticReport {
  roomCreatedAt: number; createdAt: number; updatedAt: number; expiresAt: number; batch: number;
  platform: 'ios' | 'android' | 'other'; browser: 'safari' | 'chrome' | 'other'; events: SyncDiagnostic[];
}
export const DIAGNOSTIC_RETENTION = 86400000;
const exact = (value: object, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
export function validateDiagnosticReport(value: DiagnosticReport): DiagnosticReport {
  if (!value || !exact(value, ['roomCreatedAt','createdAt','updatedAt','expiresAt','batch','platform','browser','events']) ||
    ![value.roomCreatedAt, value.createdAt, value.updatedAt, value.expiresAt].every(n => Number.isFinite(n) && n > 0) ||
    value.updatedAt < value.createdAt || value.expiresAt !== value.createdAt + DIAGNOSTIC_RETENTION ||
    !Number.isInteger(value.batch) || value.batch < 1 || value.batch > 120 ||
    !['ios','android','other'].includes(value.platform) || !['safari','chrome','other'].includes(value.browser) ||
    !Array.isArray(value.events) || !value.events.length || value.events.length > 50) throw new Error('Invalid diagnostic report.');
  for (const entry of value.events) {
    if (!entry || !exact(entry, ['event','at','page','zoom','sequence','reason','geometry']) || !diagnosticEvents.includes(entry.event) || !Number.isFinite(entry.at) || entry.at < 0 ||
      (entry.geometry !== undefined && (!['pinch-layout','pinch-frame'].includes(entry.event) || !validPinchGeometry(entry.geometry))) ||
      (entry.page !== undefined && (!Number.isInteger(entry.page) || entry.page < 1 || entry.page > 10000)) ||
      (entry.zoom !== undefined && (!Number.isFinite(entry.zoom) || entry.zoom < .75 || entry.zoom > 4)) ||
      (entry.sequence !== undefined && (!Number.isInteger(entry.sequence) || entry.sequence < 0 || entry.sequence > Number.MAX_SAFE_INTEGER)) ||
      (entry.reason !== undefined && !['saved','not-saved','maxretry','write-failed'].includes(entry.reason))) throw new Error('Invalid diagnostic event.');
  }
  return structuredClone(value);
}
