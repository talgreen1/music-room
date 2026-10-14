import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./admin', () => ({ SettingsService: class {} }));
import { showControlDialog } from './control-dialog';
import type { RoomService } from './rooms';

afterEach(() => vi.unstubAllGlobals());
describe('Control room dialog', () => {
  it('puts approval above the password form and requests access without password validation', async () => {
    const input = { value: '', focus: vi.fn() };
    const request = { onclick: undefined as unknown as () => Promise<void>, disabled: false, focus: vi.fn() };
    const closeButton = { onclick: undefined, disabled: false };
    const form = { onsubmit: undefined };
    const dialog = Object.assign(new EventTarget(), {
      innerHTML: '', showModal: vi.fn(), close: vi.fn(), remove: vi.fn(),
      querySelector: (selector: string) => ({ input, form, '#request-control': request, '.dialog-close': closeButton } as Record<string, unknown>)[selector],
      querySelectorAll: () => [request, closeButton]
    });
    vi.stubGlobal('document', { createElement: () => dialog, body: { append: vi.fn() } });
    const service = { roomCode: () => '123456', participantId: () => 'participant', control: vi.fn().mockResolvedValue(undefined) };
    const onClose = vi.fn();
    showControlDialog(service as unknown as RoomService, onClose);
    expect(dialog.innerHTML).toContain('<button class="primary" id="request-control">Ask for approval</button>');
    expect(dialog.innerHTML).toContain('<button class="secondary control-unlock" type="submit">Unlock control</button>');
    expect(dialog.innerHTML.indexOf('id="request-control"')).toBeLessThan(dialog.innerHTML.indexOf('<form>'));
    expect(dialog.innerHTML.match(/<form>[\s\S]*?<\/form>/)?.[0]).not.toContain('request-control');
    expect(input.focus).not.toHaveBeenCalled(); expect(request.focus).toHaveBeenCalledOnce(); expect(dialog.showModal).toHaveBeenCalledOnce();
    await request.onclick();
    expect(service.control).toHaveBeenCalledWith('request');
    expect(input.value).toBe(''); expect(dialog.close).toHaveBeenCalledOnce();
    expect(dialog.remove).toHaveBeenCalledOnce(); expect(onClose).toHaveBeenCalledOnce();
  });
});
