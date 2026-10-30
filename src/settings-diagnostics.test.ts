import { afterEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ reports: {} as any, remove: vi.fn(), database: vi.fn() }));
vi.mock('./rooms', () => ({ cloudConfigured: true, localServerConfigured: false }));
vi.mock('firebase/app', () => ({ getApps: () => [{ name: 'settings' }], initializeApp: vi.fn() }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('firebase/database', () => ({ getDatabase: h.database, ref: (_db: unknown, path: string) => path, get: async () => ({ val: () => structuredClone(h.reports) }), remove: h.remove }));
import { SettingsService } from './admin';
afterEach(() => vi.clearAllMocks());
it('reads reports with the separate Settings app, prunes expired sessions and safely normalizes sparse Firebase event arrays', async () => {
  const now = Date.now(), report = { roomCreatedAt: now, createdAt: now, updatedAt: now, expiresAt: now + 86400000, batch: 1, platform: 'ios', browser: 'safari', events: { 0: { event: 'pinch-start', at: now }, 49: { event: 'pinch-final', at: now } } };
  h.reports = { device: { live: report, expired: { ...report, expiresAt: now - 1 } } };
  const service = new SettingsService(), records = await service.diagnosticReports('123456');
  expect(h.database).toHaveBeenCalledWith({ name: 'settings' });
  expect(h.remove).toHaveBeenCalledWith('syncDiagnostics/123456/device/expired');
  expect(records.device.live.events).toHaveLength(2); expect(records.device.expired).toBeUndefined();
  await service.deleteDiagnosticReports('123456'); expect(h.remove).toHaveBeenLastCalledWith('syncDiagnostics/123456');
  await expect(service.diagnosticReports('../bad')).rejects.toThrow('six-digit');
});
