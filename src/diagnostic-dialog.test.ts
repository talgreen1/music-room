// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { showDiagnosticReports } from './diagnostic-dialog';
const flush = async () => { for (let n = 0; n < 15; n++) await Promise.resolve(); };
beforeEach(() => {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
it('loads administrator reports by room, displays safe text and deletes only after explicit confirmation', async () => {
  const report = { roomCreatedAt: 1, createdAt: 1, updatedAt: 2, expiresAt: 86400001, batch: 1, platform: 'ios' as const, browser: 'safari' as const, events: [{ event: 'pinch-start' as const, at: 2 }] };
  const service = { diagnosticReports: vi.fn().mockResolvedValue({ owner: { session: report } }), deleteDiagnosticReports: vi.fn().mockResolvedValue(undefined) };
  const close = showDiagnosticReports(service); document.querySelector('input')!.value = '123456'; document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await flush();
  expect(service.diagnosticReports).toHaveBeenCalledWith('123456'); expect(document.querySelector('pre')!.textContent).toContain('pinch-start');
  vi.spyOn(window, 'confirm').mockReturnValue(false); document.querySelector<HTMLButtonElement>('.diagnostic-delete')!.click(); expect(service.deleteDiagnosticReports).not.toHaveBeenCalled();
  vi.mocked(window.confirm).mockReturnValue(true); document.querySelector<HTMLButtonElement>('.diagnostic-delete')!.click(); await flush(); expect(service.deleteDiagnosticReports).toHaveBeenCalledWith('123456'); expect(document.querySelector('pre')).toBeNull(); close();
});
it('suppresses late report responses after closing', async () => {
  let finish!: (reports: {}) => void;
  const close = showDiagnosticReports({ diagnosticReports: () => new Promise(resolve => { finish = resolve; }), deleteDiagnosticReports: async () => {} });
  document.querySelector('input')!.value = '123456'; document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); close(); finish({}); await flush(); expect(document.querySelector('dialog')).toBeNull();
});
