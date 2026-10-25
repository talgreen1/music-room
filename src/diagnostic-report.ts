export const diagnosticEvents = ['session-start', 'pinch-start', 'pinch-final', 'pinch-settled', 'remote-deferred', 'position-write-failed'] as const;
export type DiagnosticEvent = typeof diagnosticEvents[number];
export interface SyncDiagnostic { event: DiagnosticEvent; at: number; page?: number; zoom?: number; sequence?: number; reason?: 'saved' | 'not-saved' | 'maxretry' | 'write-failed' }
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
    if (!entry || !exact(entry, ['event','at','page','zoom','sequence','reason']) || !diagnosticEvents.includes(entry.event) || !Number.isFinite(entry.at) || entry.at < 0 ||
      (entry.page !== undefined && (!Number.isInteger(entry.page) || entry.page < 1 || entry.page > 10000)) ||
      (entry.zoom !== undefined && (!Number.isFinite(entry.zoom) || entry.zoom < .75 || entry.zoom > 4)) ||
      (entry.sequence !== undefined && (!Number.isInteger(entry.sequence) || entry.sequence < 0 || entry.sequence > Number.MAX_SAFE_INTEGER)) ||
      (entry.reason !== undefined && !['saved','not-saved','maxretry','write-failed'].includes(entry.reason))) throw new Error('Invalid diagnostic event.');
  }
  return structuredClone(value);
}
