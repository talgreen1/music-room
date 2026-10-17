// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import type { Room } from './model';
const harness = vi.hoisted(() => ({
  receive: undefined as undefined | ((room: Room | null) => void),
  owner: true, controlling: true, load: vi.fn(), follow: vi.fn()
}));
vi.mock('./rooms', () => ({
  cloudConfigured: true, localServerConfigured: false, songbook: { pdfTitle: 'Book', pdfVersion: '1' },
  RoomService: class {
    async init() {}
    leave() {}
    watch(_code: string, receive: (room: Room | null) => void, status: (status: string) => void) { harness.receive = receive; status('Connected'); }
    isMaster() { return harness.owner; }
    canControl() { return harness.controlling; }
    participantId() { return 'owner'; }
    shouldFollow() { return true; }
  }
}));
vi.mock('./viewer', () => ({ SongbookViewer: class {
  count = 145;
  load = harness.load;
  follow = harness.follow;
  cancelFollow() {}
  destroy() {}
  position() { return { page: 2, offset: .3, zoom: 1, horizontal: 0 }; }
} }));
const flush = async () => { for (let n = 0; n < 30; n++) await Promise.resolve(); };
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
it('restores the viewer and editable Master controls after missing data, including the same sequence, and keeps following usable', async () => {
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
  harness.load.mockResolvedValue(undefined); document.body.innerHTML = '<div id="app"></div>';
  history.replaceState({}, '', '/?room=123456'); await import('./main'); await flush();
  const active: Room = { masterId: 'owner', createdAt: Date.now(), expiresAt: Date.now() + 86400000, pdfUrl: '/book.pdf', pdfVersion: '1', pdfTitle: 'Book', position: { page: 2, offset: .3, zoom: 1, sequence: 1 } };
  harness.receive!(active); await flush(); expect(document.querySelector('#role')!.textContent).toBe('Master');
  harness.receive!(null); await flush(); expect(document.querySelector<HTMLElement>('.room-recovery')!.hidden).toBe(false);
  harness.receive!(active); await flush();
  expect(document.querySelector<HTMLElement>('.room-recovery')!.hidden).toBe(true);
  expect(document.querySelector<HTMLElement>('.pdf-frame')!.hidden).toBe(false);
  expect(document.querySelector<HTMLElement>('.toolbar')!.hidden).toBe(false);
  expect(document.querySelector('#role')!.textContent).toBe('Master');
  expect(document.querySelector('#pdf')!.classList.contains('locked')).toBe(false);
  expect(harness.load).toHaveBeenCalledTimes(2);
  expect(harness.follow).toHaveBeenLastCalledWith(active.position, true, true);
  let finishOldLoad!: () => void;
  harness.load.mockImplementationOnce(() => new Promise<void>(resolve => { finishOldLoad = resolve; }));
  harness.receive!({ ...active, sheet: { id: 'a'.repeat(32), title: 'Other', pdfUrl: '/other.pdf' }, position: { ...active.position, sequence: 2 } }); await flush();
  harness.receive!(null); finishOldLoad(); await flush();
  expect(document.querySelector<HTMLElement>('.room-recovery')!.hidden).toBe(false);
  expect(document.querySelector<HTMLElement>('.pdf-frame')!.hidden).toBe(true);
  harness.receive!({ ...active, position: { ...active.position, sequence: 3 } }); await flush();
  expect(document.querySelector<HTMLElement>('.room-recovery')!.hidden).toBe(true);
  expect(document.querySelector('#role')!.textContent).toBe('Master');
  harness.owner = harness.controlling = false;
  harness.receive!({ ...active, position: { ...active.position, sequence: 4 } }); await flush();
  const sync = document.querySelector<HTMLInputElement>('.sync-control input')!;
  expect(sync.checked).toBe(true); sync.click();
  expect(document.querySelector('#pdf')!.classList.contains('locked')).toBe(false);
  sync.click(); expect(document.querySelector('#pdf')!.classList.contains('locked')).toBe(true);
  // Dispose the room timers/listeners through the normal navigation path.
  history.replaceState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); await flush();
});
