import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyRoomUrl } from './clipboard';

afterEach(() => vi.unstubAllGlobals());
function fixture(copied = true, fallback = vi.fn().mockResolvedValue(undefined)) {
  const field = { value: '', readOnly: false, style: { cssText: '' }, setAttribute: vi.fn(), focus: vi.fn(), select: vi.fn(), setSelectionRange: vi.fn(), remove: vi.fn() };
  const focus = vi.fn(), append = vi.fn();
  vi.stubGlobal('document', { createElement: () => field, activeElement: { focus }, execCommand: vi.fn(() => copied) });
  vi.stubGlobal('navigator', { clipboard: { writeText: fallback } });
  return { field, focus, append, fallback, dialog: { append } as unknown as HTMLDialogElement };
}
describe('room link copying', () => {
  it('copies the exact URL inside the modal and restores focus without invoking the fallback', async () => {
    const f = fixture(); const url = 'https://example.org/?room=123456';
    expect(await copyRoomUrl(url, f.dialog)).toBe(true);
    expect(f.append).toHaveBeenCalledWith(f.field);
    expect(f.field.value).toBe(url); expect(f.field.select).toHaveBeenCalled();
    expect(f.field.setSelectionRange).toHaveBeenCalledWith(0, url.length);
    expect(f.field.remove).toHaveBeenCalled(); expect(f.focus).toHaveBeenCalled();
    expect(f.fallback).not.toHaveBeenCalled();
  });
  it('uses the secure clipboard when synchronous copying fails', async () => {
    const f = fixture(false);
    expect(await copyRoomUrl('room-url', f.dialog)).toBe(true);
    expect(f.fallback).toHaveBeenCalledWith('room-url'); expect(f.field.remove).toHaveBeenCalled();
  });
  it('reports failure when both browser clipboard mechanisms are unavailable', async () => {
    const f = fixture(false, vi.fn().mockRejectedValue(new Error('Permission denied')));
    expect(await copyRoomUrl('room-url', f.dialog)).toBe(false);
    vi.stubGlobal('document', { createElement: () => f.field, activeElement: null });
    vi.stubGlobal('navigator', {});
    expect(await copyRoomUrl('room-url', f.dialog)).toBe(false);
  });
});
