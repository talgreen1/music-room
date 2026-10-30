import type { DiagnosticReport } from './diagnostic-report';
export function showDiagnosticReports(service: { diagnosticReports(code: string): Promise<Record<string, Record<string, DiagnosticReport>>>; deleteDiagnosticReports(code: string): Promise<void> }): () => void {
  const dialog = document.createElement('dialog'); dialog.className = 'sheet-dialog'; dialog.setAttribute('aria-label', 'Sync debug reports');
  dialog.innerHTML = '<button class="dialog-close icon-button" aria-label="Close debug reports">×</button><h2>Sync debug reports</h2><p>Open the room with &amp;syncDebug=1, reproduce the problem and wait at least five seconds. Reports upload automatically while the tab and network remain available. Expired reports are removed when loaded here.</p><form><label>Room code<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label><button class="primary" type="submit">Load reports</button></form><button class="danger diagnostic-delete" hidden>Delete room reports</button><p class="diagnostic-status" role="status"></p><div class="diagnostic-reports"></div>';
  document.body.append(dialog); dialog.showModal();
  let alive = true, revision = 0, loadedCode = '';
  const list = dialog.querySelector<HTMLElement>('.diagnostic-reports')!, status = dialog.querySelector<HTMLElement>('.diagnostic-status')!, remove = dialog.querySelector<HTMLButtonElement>('.diagnostic-delete')!;
  const close = () => { if (!alive) return; alive = false; revision++; list.replaceChildren(); dialog.close(); dialog.remove(); };
  dialog.querySelector<HTMLButtonElement>('.dialog-close')!.onclick = close; dialog.addEventListener('close', close);
  dialog.querySelector<HTMLFormElement>('form')!.onsubmit = async event => {
    event.preventDefault(); const current = ++revision;
    const input = dialog.querySelector<HTMLInputElement>('input')!, code = input.value.trim(); input.blur();
    list.replaceChildren(); remove.hidden = true; loadedCode = ''; status.textContent = 'Loading reports…';
    try {
      const records = await service.diagnosticReports(code); if (!alive || current !== revision) return;
      const reports = Object.values(records).flatMap(sessions => Object.entries(sessions));
      for (const [id, report] of reports.sort((a, b) => b[1].updatedAt - a[1].updatedAt)) {
        const details = document.createElement('details'), title = document.createElement('summary'), text = document.createElement('pre');
        title.textContent = `${report.platform} / ${report.browser} | ${new Date(report.updatedAt).toLocaleString()} | ${report.events.length} events | ${id.slice(0, 8)}`;
        text.style.whiteSpace = 'pre-wrap'; text.style.overflowWrap = 'anywhere'; text.textContent = JSON.stringify(report, null, 2);
        details.append(title, text); list.append(details);
      }
      loadedCode = code; remove.hidden = reports.length === 0; status.textContent = `${reports.length} report(s) for room ${code}. Load again to refresh.`;
    } catch (error) { if (alive && current === revision) status.textContent = error instanceof Error ? error.message : 'Could not load reports.'; }
  };
  remove.onclick = async () => {
    if (!loadedCode || !confirm(`Delete debug reports for room ${loadedCode}?`)) return;
    const current = ++revision; remove.disabled = true;
    try { await service.deleteDiagnosticReports(loadedCode); if (alive && revision === current) { list.replaceChildren(); remove.hidden = true; status.textContent = 'Reports deleted. Reload the debug room tab to start a new report.'; } }
    catch { if (alive && revision === current) status.textContent = 'Could not delete reports.'; }
    finally { if (alive) remove.disabled = false; }
  };
  return close;
}
