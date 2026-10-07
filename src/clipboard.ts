/** Keep the temporary field inside the modal so mobile browsers can focus it. */
export async function copyRoomUrl(url: string, dialog: HTMLDialogElement): Promise<boolean> {
  const field = document.createElement('textarea');
  field.value = url; field.readOnly = true;
  field.setAttribute('aria-label', 'Room link to copy');
  field.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;font-size:16px';
  const focused = document.activeElement as HTMLElement | null;
  dialog.append(field);
  try {
    field.focus({ preventScroll: true }); field.select(); field.setSelectionRange(0, url.length);
    // Synchronous copy retains the original tap's user activation on phones.
    if (document.execCommand('copy')) return true;
  } catch { /* Try the secure clipboard API next. */ }
  finally { field.remove(); focused?.focus({ preventScroll: true }); }
  try { await navigator.clipboard.writeText(url); return true; } catch { return false; }
}
