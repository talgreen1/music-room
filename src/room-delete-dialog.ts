export function showRoomDeleteDialog(label: string, count: number) {
  const dialog = document.createElement('dialog'); dialog.className = 'room-delete-dialog'; dialog.setAttribute('aria-label', 'Delete rooms and choose file retention');
  const heading = document.createElement('h2'); heading.textContent = `Delete ${label}?`;
  const description = document.createElement('p'); description.textContent = `Participants will be disconnected. ${count} uploaded file(s). Keep them for future rooms, or delete them from the library. The current default is always kept. Files in other active rooms remain visible there until those rooms switch away or expire.`;
  const actions = document.createElement('div'); actions.className = 'settings-actions';
  let settled = false, resolve!: (value: boolean | undefined) => void;
  const result = new Promise<boolean | undefined>(done => { resolve = done; });
  const finish = (value?: boolean) => { if (settled) return; settled = true; dialog.close(); dialog.remove(); resolve(value); };
  for (const [text, value, style] of [['Delete room(s), keep files', false, 'primary'], ['Delete room(s) and files', true, 'danger'], ['Cancel', undefined, 'secondary']] as const) {
    const button = document.createElement('button'); button.className = style; button.textContent = text; button.onclick = () => finish(value); actions.append(button);
  }
  dialog.append(heading, description, actions); document.body.append(dialog);
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); }); dialog.addEventListener('close', () => finish()); dialog.showModal();
  return { result, close: () => finish() };
}
