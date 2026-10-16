// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomService } from './rooms';
const mocks = vi.hoisted(() => ({ thumbnails: vi.fn(), load: vi.fn(), loadSheet: vi.fn(), follow: vi.fn(), destroy: vi.fn() }));
vi.mock('./library-thumbnails', () => ({ createLibraryThumbnails: mocks.thumbnails }));
vi.mock('./viewer', () => ({ SongbookViewer: class { load = mocks.load; loadSheet = mocks.loadSheet; follow = mocks.follow; destroy = mocks.destroy; } }));
import { showSongLibrary } from './song-dialog';

const original = { id: 'pdf', title: 'Original', pdfUrl: '/original.pdf' };
const pdf = { id: 'a'.repeat(32), title: 'PDF song', pdfUrl: '/song.pdf', ownerId: 'u', createdAt: 1 };
const image = { id: 'b'.repeat(32), title: 'Image song', segments: [{ url: '/song.jpg', width: 900, height: 1200 }], ownerId: 'u', createdAt: 2 };
const managers: { add: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[] = [];
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
  vi.clearAllMocks(); managers.length = 0;
  mocks.thumbnails.mockImplementation(() => { const manager = { add: vi.fn(), destroy: vi.fn() }; managers.push(manager); return manager; });
  mocks.load.mockResolvedValue(undefined); mocks.loadSheet.mockResolvedValue(undefined);
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')); });
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers(); });
function open(viewOnly = false) {
  const service = { songs: vi.fn().mockResolvedValue([pdf, image]), changeSheet: vi.fn().mockResolvedValue(undefined) };
  const close = showSongLibrary(service as unknown as RoomService, 'Original', { original, viewOnly });
  return { service, close };
}
describe('thumbnail/list library chooser', () => {
  it('defaults to thumbnails for original, PDF and image entries and switches locally to the list', async () => {
    const t = open(); await flush();
    expect(document.querySelector('.library-list')!.classList.contains('library-grid')).toBe(true);
    expect(document.querySelector('#library-thumbnails')!.getAttribute('aria-pressed')).toBe('true');
    expect(managers.at(-1)!.add.mock.calls.map(call => call[0])).toEqual([original, pdf, image]);
    (document.querySelector('#library-text-list') as HTMLButtonElement).click();
    expect(managers.at(-1)!.destroy).toHaveBeenCalled();
    expect(document.querySelectorAll('.library-thumbnail')).toHaveLength(0);
    expect(document.querySelector('.library-list')!.classList.contains('library-grid')).toBe(false);
    expect(document.querySelectorAll('.library-choice')).toHaveLength(3);
    expect(t.service.changeSheet).not.toHaveBeenCalled();
    (document.querySelector('#library-thumbnails') as HTMLButtonElement).click();
    expect(managers.at(-1)!.add).toHaveBeenCalledTimes(3); t.close();
    expect(managers.at(-1)!.destroy).toHaveBeenCalled();
  });
  it('uses the same shared-file selection in either view, including returning to the original', async () => {
    let t = open(); await flush();
    (document.querySelectorAll('.library-choice')[1] as HTMLButtonElement).click(); await flush();
    expect(t.service.changeSheet).toHaveBeenCalledWith(pdf); expect(document.querySelector('dialog')).toBeNull();
    t = open(); await flush();
    (document.querySelector('#library-text-list') as HTMLButtonElement).click();
    (document.querySelector('.library-choice') as HTMLButtonElement).click(); await flush();
    expect(t.service.changeSheet).toHaveBeenCalledWith(undefined);
  });
  it('keeps Follower choices private and disposes previews when the library closes', async () => {
    const t = open(true); await flush();
    (document.querySelectorAll('.library-choice')[2] as HTMLButtonElement).click(); await flush();
    expect(mocks.loadSheet).toHaveBeenCalledWith(image); expect(t.service.changeSheet).not.toHaveBeenCalled();
    expect(document.querySelectorAll('dialog')).toHaveLength(2);
    t.close(); expect(mocks.destroy).toHaveBeenCalled(); expect(document.querySelectorAll('dialog')).toHaveLength(0);
  });
  it('retains the chosen view on refresh, updates new songs and ignores late responses after close', async () => {
    const t = open(); await flush();
    (document.querySelector('#library-text-list') as HTMLButtonElement).click();
    t.service.songs.mockResolvedValueOnce([pdf]);
    (document.querySelector('.library-refresh') as HTMLButtonElement).click(); await flush();
    expect(document.querySelectorAll('.library-choice')).toHaveLength(2);
    expect(document.querySelector('#library-text-list')!.getAttribute('aria-pressed')).toBe('true');
    let resolve!: (value: typeof pdf[]) => void;
    t.service.songs.mockReturnValueOnce(new Promise(value => { resolve = value; }));
    (document.querySelector('.library-refresh') as HTMLButtonElement).click(); t.close(); resolve([pdf]); await flush();
    expect(document.querySelector('dialog')).toBeNull();
    const reopened = open(); await flush(); expect(document.querySelector('#library-thumbnails')!.getAttribute('aria-pressed')).toBe('true'); reopened.close();
  });
  it('automatically includes new uploads without rebuilding unchanged thumbnail cards', async () => {
    vi.useFakeTimers(); const t = open(); await flush(); const manager = managers.at(-1)!;
    await vi.advanceTimersByTimeAsync(2500); expect(managers.at(-1)).toBe(manager);
    t.service.songs.mockResolvedValueOnce([pdf]); await vi.advanceTimersByTimeAsync(2500);
    expect(manager.destroy).toHaveBeenCalled(); expect(document.querySelectorAll('.library-choice')).toHaveLength(2);
    t.close(); const calls = t.service.songs.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000); expect(t.service.songs).toHaveBeenCalledTimes(calls);
  });
});
