import { SettingsService } from './admin';
import type { RoomService } from './rooms';

export function showControlRequests(service: RoomService, requests: () => string[]) {
  const dialog = document.createElement('dialog'); dialog.className = 'control-dialog';
  dialog.innerHTML = '<button class="dialog-close icon-button" aria-label="Close">×</button><h2>Control requests</h2><div></div><p role="alert"></p>';
  let closed = false;
  const close = () => { closed = true; dialog.close(); dialog.remove(); };
  let displayed = '';
  const refresh = () => {
    if (closed) return;
    const current = requests().join(',');
    if (displayed === current && dialog.querySelector('div')!.childNodes.length) return;
    displayed = current;
    const list = dialog.querySelector('div')!; list.replaceChildren();
    const ids = requests();
    if (!ids.length) list.textContent = 'No pending requests.';
    for (const id of ids) {
      const row = document.createElement('p'); row.textContent = `Participant ${id.slice(-6)} `;
      for (const action of ['approve', 'deny'] as const) {
        const button = document.createElement('button'); button.className = 'secondary'; button.textContent = action === 'approve' ? 'Approve' : 'Deny';
        button.onclick = async () => {
          row.querySelectorAll('button').forEach(control => { control.disabled = true; });
          try { await service.control(action, id); refresh(); }
          catch (error) { if (!closed) { dialog.querySelector('[role=alert]')!.textContent = error instanceof Error ? error.message : 'Could not update request.'; displayed = ''; dialog.querySelector('div')!.replaceChildren(); refresh(); } }
        };
        row.append(button);
      }
      list.append(row);
    }
  };
  dialog.querySelector<HTMLButtonElement>('button')!.onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.body.append(dialog); refresh(); dialog.showModal();
  return { close, refresh };
}

/** Elevate this musician only; never keep the Settings identity signed in. */
export function showControlDialog(service: RoomService, onClose: () => void) {
  const code = service.roomCode(), member = service.participantId();
  const dialog = document.createElement('dialog'); dialog.className = 'control-dialog';
  dialog.innerHTML = `<button class="dialog-close icon-button" aria-label="Close">×</button><h2>Control room</h2><form><label>Settings password<input type="password" required autocomplete="off" /></label><button class="primary" type="submit">Unlock control</button></form><p>Or ask the room owner.</p><button class="secondary" id="request-control">Ask for approval</button><p role="alert"></p>`;
  document.body.append(dialog);
  let closed = false;
  const close = () => { if (closed) return; closed = true; dialog.close(); dialog.remove(); onClose(); };
  dialog.querySelector<HTMLButtonElement>('.dialog-close')!.onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  const busy = (value: boolean) => dialog.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = value; });
  const report = (error: unknown) => { if (!closed) dialog.querySelector('[role=alert]')!.textContent = error instanceof Error ? error.message : 'Could not enable control.'; };
  dialog.querySelector<HTMLFormElement>('form')!.onsubmit = async event => {
    event.preventDefault(); busy(true);
    const settings = new SettingsService();
    try {
      await settings.login(dialog.querySelector<HTMLInputElement>('input')!.value);
      if (closed || service.roomCode() !== code || service.participantId() !== member) return;
      await settings.grantRoomControl(code, member); close();
    } catch (error) { report(error); }
    finally { await settings.logout().catch(() => {}); if (!closed) busy(false); }
  };
  dialog.querySelector<HTMLButtonElement>('#request-control')!.onclick = async () => {
    busy(true);
    try { await service.control('request'); close(); } catch (error) { report(error); busy(false); }
  };
  dialog.showModal(); dialog.querySelector<HTMLInputElement>('input')!.focus();
  return close;
}
