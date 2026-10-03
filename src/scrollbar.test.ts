import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdfScrollbar } from './scrollbar';

function setup() {
  const captures = new Set<number>();
  const attributes = new Map<string, string>();
  const element = () => Object.assign(new EventTarget(), {
    style: {} as Record<string, string>, clientHeight: 500, tabIndex: -1,
    append: vi.fn(), remove: vi.fn(),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    getBoundingClientRect: () => ({ top: 10, height: 50 }),
    setPointerCapture: (id: number) => captures.add(id),
    hasPointerCapture: (id: number) => captures.has(id),
    releasePointerCapture: (id: number) => captures.delete(id)
  });
  const track = element(), thumb = element();
  Object.defineProperty(thumb, 'offsetHeight', { get: () => parseFloat(thumb.style.height || '0') });
  vi.stubGlobal('document', { createElement: vi.fn().mockReturnValueOnce(track).mockReturnValueOnce(thumb) });
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnect; });
  const host = Object.assign(new EventTarget(), { id: 'pdf', clientHeight: 500, scrollHeight: 5000, scrollTop: 0 });
  const scrollbar = new PdfScrollbar(host as unknown as HTMLElement);
  const pointer = (type: string, y: number) => {
    const event = Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, pointerType: 'touch', clientY: y });
    track.dispatchEvent(event); return event;
  };
  const key = (key: string) => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { key });
    track.dispatchEvent(event); return event;
  };
  return { scrollbar, host, track, thumb, attributes, captures, disconnect, pointer, key };
}
afterEach(() => vi.unstubAllGlobals());

describe('PDF fast scrollbar', () => {
  it('drags through the whole document and preserves the grab offset', () => {
    const t = setup(); t.scrollbar.setEnabled(true);
    t.pointer('pointerdown', 35); t.pointer('pointermove', 485);
    expect(t.host.scrollTop).toBe(4500);
    expect(t.attributes.get('aria-valuenow')).toBe('100');
    expect(t.thumb.style.top).toBe('450px');
    t.pointer('pointerup', 485); expect(t.captures.size).toBe(0);
    t.scrollbar.destroy();
  });
  it('disables scrolling while following and cancels a drag when locked', () => {
    const t = setup();
    t.pointer('pointerdown', 250); t.key('End'); expect(t.host.scrollTop).toBe(0);
    t.scrollbar.setEnabled(true); t.pointer('pointerdown', 35);
    expect(t.captures.size).toBe(1);
    t.scrollbar.setEnabled(false); t.pointer('pointermove', 485);
    expect(t.captures.size).toBe(0); expect(t.host.scrollTop).toBe(0);
    expect(t.track.tabIndex).toBe(-1); t.scrollbar.destroy();
  });
  it('supports keyboard navigation and tracks programmatic scrolls', () => {
    const t = setup(); t.scrollbar.setEnabled(true);
    expect(t.key('PageDown').defaultPrevented).toBe(true); expect(t.host.scrollTop).toBe(500);
    t.key('End'); expect(t.host.scrollTop).toBe(4500);
    t.key('Home'); expect(t.host.scrollTop).toBe(0);
    t.host.scrollTop = 2250; t.host.dispatchEvent(new Event('scroll'));
    expect(t.attributes.get('aria-valuenow')).toBe('50');
    expect(t.thumb.style.top).toBe('225px');
    t.scrollbar.destroy(); expect(t.disconnect).toHaveBeenCalledOnce();
  });
  it('fills the track for a document that fits and handles zero-height loading', () => {
    const t = setup(); t.host.scrollHeight = 500; t.scrollbar.refresh();
    expect(t.thumb.style.height).toBe('500px'); expect(t.attributes.get('aria-valuenow')).toBe('0');
    t.track.clientHeight = 0; t.scrollbar.refresh();
    expect(t.thumb.style.height).toBe('0px'); expect(t.thumb.style.top).toBe('0px');
    t.scrollbar.destroy();
  });
});
