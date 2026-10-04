import { SettingsService } from './admin';
import type { Songbook } from './songbook';

export function showSettings(app: HTMLElement, back: () => void) {
  const service = new SettingsService();
  let alive = true;
  app.innerHTML = `<main class="settings"><header><button id="settings-back" class="secondary">Back</button><h1>Settings</h1><button id="settings-logout" class="secondary" hidden>Lock</button></header>
    <p id="settings-status" role="status"></p><form id="settings-login" class="entry-card"><label for="settings-password">Settings password</label><input id="settings-password" type="password" autocomplete="current-password" required><button class="primary" type="submit">Unlock settings</button></form>
    <section id="settings-content" hidden><section class="entry-card"><h2>Rooms</h2><div class="settings-actions"><button id="rooms-refresh" class="secondary">Refresh</button><button id="rooms-delete-all" class="danger">Delete all rooms</button></div><p>Deleting a room disconnects its participants.</p><div id="settings-rooms"></div></section>
    <section class="entry-card"><h2>Default PDF</h2><a id="settings-preview" target="_blank" rel="noopener">View current PDF</a><form id="settings-pdf"><label for="pdf-file">Replacement PDF (up to 30 MB)</label><input id="pdf-file" type="file" accept="application/pdf,.pdf" required><label for="pdf-title">Title</label><input id="pdf-title" required maxlength="200"><label for="pdf-version">Version</label><input id="pdf-version" required maxlength="100"><p>New rooms use the uploaded PDF. Existing rooms keep their current songbook.</p><button class="primary" type="submit">Upload and update PDF</button></form></section></section></main>`;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => app.querySelector<T>(selector)!;
  const report = (text: string) => { if (alive) $('#settings-status').textContent = text; };
  const fail = (error: unknown) => report(error instanceof Error ? error.message : 'Settings operation failed.');
  const leave = () => { alive = false; void service.logout().catch(() => {}); back(); };
  $('#settings-back').onclick = leave;
  const lock = async () => { await service.logout(); if (!alive) return; $('#settings-login').hidden = false; $('#settings-content').hidden = true; $('#settings-logout').hidden = true; $('#settings-rooms').replaceChildren(); };
  $('#settings-logout').onclick = () => void lock().catch(fail);
  async function refresh() {
    const rooms = await service.rooms(); if (!alive) return;
    const list = $('#settings-rooms'); list.replaceChildren();
    for (const [code, room] of Object.entries(rooms).sort()) {
      const row = document.createElement('div'); row.className = 'settings-room';
      const text = document.createElement('span'); text.textContent = `${code} · ${room.pdfTitle} · page ${room.position.page} · ${room.expiresAt > Date.now() ? 'Active' : 'Expired'}`;
      const remove = document.createElement('button'); remove.className = 'danger'; remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete room ${code}`);
      remove.onclick = async () => {
        if (!confirm(`Delete room ${code} and disconnect its participants?`)) return;
        remove.disabled = true;
        try { await service.deleteRooms(code); await refresh(); report(`Room ${code} deleted.`); } catch (error) { fail(error); remove.disabled = false; }
      };
      row.append(text, remove); list.append(row);
    }
    if (!Object.keys(rooms).length) list.textContent = 'No rooms.';
    $<HTMLButtonElement>('#rooms-delete-all').disabled = !Object.keys(rooms).length;
  }
  function fill(value: Songbook) {
    $<HTMLInputElement>('#pdf-file').value = ''; $<HTMLInputElement>('#pdf-title').value = value.pdfTitle; $<HTMLInputElement>('#pdf-version').value = value.pdfVersion;
    $<HTMLAnchorElement>('#settings-preview').href = value.pdfUrl;
  }
  $<HTMLFormElement>('#settings-login').onsubmit = async event => {
    event.preventDefault(); const button = $<HTMLButtonElement>('#settings-login button'); button.disabled = true; report('');
    const input = $<HTMLInputElement>('#settings-password'); const password = input.value; input.value = '';
    try {
      await service.login(password); const value = await service.defaultPdf(); if (!alive) { await service.logout(); return; }
      fill(value); await refresh(); if (!alive) return;
      $('#settings-login').hidden = true; $('#settings-content').hidden = false; $('#settings-logout').hidden = false;
    } catch (error) { fail(error); } finally { if (alive) button.disabled = false; }
  };
  $('#rooms-refresh').onclick = () => void refresh().catch(fail);
  $('#rooms-delete-all').onclick = async () => {
    if (!confirm('Delete ALL rooms and disconnect all participants?')) return;
    const button = $<HTMLButtonElement>('#rooms-delete-all'); button.disabled = true;
    try { await service.deleteRooms(); await refresh(); report('All rooms deleted.'); } catch (error) { fail(error); button.disabled = false; }
  };
  $<HTMLFormElement>('#settings-pdf').onsubmit = async event => {
    event.preventDefault(); const button = $<HTMLButtonElement>('#settings-pdf button'); button.disabled = true;
    const file = $<HTMLInputElement>('#pdf-file').files?.[0];
    try {
      if (!file) throw new Error('Choose a replacement PDF.');
      const pdfTitle = $<HTMLInputElement>('#pdf-title').value.trim(), pdfVersion = $<HTMLInputElement>('#pdf-version').value.trim();
      if (!pdfTitle || !pdfVersion) throw new Error('Enter a title and version.');
      report('Uploading PDF…');
      const value = { pdfUrl: await service.uploadPdf(file), pdfTitle, pdfVersion };
      await service.updatePdf(value); if (alive) fill(value); report('Default PDF updated for new rooms.');
    } catch (error) { fail(error); }
    finally { if (alive) button.disabled = false; }
  };
  return () => { alive = false; void service.logout().catch(() => {}); };
}
