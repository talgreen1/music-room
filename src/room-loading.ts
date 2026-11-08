import { operationError } from './operation-timeout';
export interface DocumentProgress { stage: 'download' | 'prepare'; loaded: number; total?: number }
const bytes = (value: number) => value < 1e6 ? `${(value / 1000).toFixed(0)} KB` : `${(value / 1e6).toFixed(1)} MB`;
export class RoomLoading {
  readonly element = document.createElement('section');
  private connectionRow = this.row('Room connection');
  private documentRow = this.row('Document loading');
  private connectionTimer?: ReturnType<typeof setTimeout>;
  private documentTimer?: ReturnType<typeof setTimeout>;
  private connectionKey = '';
  private documentKey = '';
  private alive = true;
  constructor(private fail: (error: Error, stage: string) => void) {
    this.element.className = 'room-loading'; this.element.setAttribute('aria-label', 'Room loading progress');
    this.documentRow.row.hidden = true; this.element.append(this.connectionRow.row, this.documentRow.row);
  }
  private row(label: string) {
    const row = document.createElement('div'), text = document.createElement('span'), bar = document.createElement('progress');
    text.setAttribute('role', 'status'); bar.max = 1; bar.setAttribute('aria-label', label); row.append(text, bar); return { row, text, bar };
  }
  connection(stage: string, label: string, done = false) {
    if (!this.alive) return;
    const key = `${stage}:${done}`;
    if (key !== this.connectionKey) {
      clearTimeout(this.connectionTimer); this.connectionKey = key;
      if (!done) this.connectionTimer = setTimeout(() => this.fail(operationError('room/connection-timeout', `Room connection did not complete within 30 seconds (${stage}). Check your network and try again.`), stage), 30000);
    }
    this.connectionRow.text.textContent = label; this.connectionRow.row.hidden = done; this.refresh();
  }
  startDocument(images = false) {
    if (!this.alive) return;
    this.documentKey = ''; this.documentRow.row.hidden = false; this.documentRow.bar.removeAttribute('value');
    this.documentRow.text.textContent = images ? 'Preparing images…' : 'Downloading PDF…'; this.documentHeartbeat(); this.refresh();
  }
  progress(value: DocumentProgress) {
    if (!this.alive || this.documentRow.row.hidden || !Number.isFinite(value.loaded) || value.loaded < 0) return;
    const total = value.total && Number.isFinite(value.total) && value.total > 0 ? value.total : undefined;
    const key = `${value.stage}:${value.loaded}:${total}`;
    if (key !== this.documentKey) { this.documentKey = key; this.documentHeartbeat(); }
    if (total) this.documentRow.bar.value = Math.min(1, value.loaded / total); else this.documentRow.bar.removeAttribute('value');
    this.documentRow.text.textContent = value.stage === 'prepare'
      ? `Preparing PDF pages${total ? `: ${value.loaded} / ${total}` : '…'}`
      : `Downloading PDF: ${bytes(value.loaded)}${total ? ` / ${bytes(total)} (${Math.min(100, Math.floor(value.loaded / total * 100))}%)` : ''}`;
  }
  private documentHeartbeat() {
    clearTimeout(this.documentTimer);
    this.documentTimer = setTimeout(() => this.fail(operationError('document/load-timeout', 'No document loading progress for 45 seconds. The download or PDF preparation may be stalled. Check your network and try again.'), 'document loading'), 45000);
  }
  documentDone() { clearTimeout(this.documentTimer); this.documentRow.row.hidden = true; this.refresh(); }
  private refresh() { this.element.hidden = this.connectionRow.row.hidden && this.documentRow.row.hidden; }
  stop() { clearTimeout(this.connectionTimer); clearTimeout(this.documentTimer); this.connectionKey = ''; this.documentRow.row.hidden = true; this.connectionRow.row.hidden = true; this.refresh(); }
  destroy() { this.alive = false; this.stop(); this.element.remove(); }
}
