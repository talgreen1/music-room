import { describe, expect, it, vi } from 'vitest';
import { PdfGestures } from './gestures';
import { canInteractWithDocument } from './follower-sync';

function setup() {
  const target = new EventTarget();
  const capture = new Set<number>();
  const classes = new Set<string>();
  const host = Object.assign(target, {
    clientHeight: 600,
    getBoundingClientRect: () => ({ left: 10, top: 20 }),
    setPointerCapture: (id: number) => capture.add(id),
    hasPointerCapture: (id: number) => capture.has(id),
    releasePointerCapture: (id: number) => capture.delete(id),
    classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) }
  }) as unknown as HTMLElement;
  const callbacks = { locked: vi.fn(() => false), pan: vi.fn(), zoom: vi.fn(), start: vi.fn(), end: vi.fn() };
  const gestures = new PdfGestures(host, callbacks);
  const pointer = (type: string, id: number, x: number, y: number, button = 0) => {
    const event = Object.assign(new Event(type, { cancelable: true }), { pointerId: id, pointerType: 'touch', button, clientX: x + 10, clientY: y + 20 });
    target.dispatchEvent(event); return event;
  };
  return { target, capture, classes, callbacks, gestures, pointer };
}

describe('PDF gestures', () => {
  it('locks synced Followers until explicit opt-out, and locks again when sync is checked', () => {
    const t = setup(); let following = true;
    t.callbacks.locked.mockImplementation(() => !canInteractWithDocument(true, false, following));
    t.pointer('pointerdown', 1, 100, 100); t.pointer('pointerdown', 2, 200, 100);
    t.pointer('pointermove', 1, 80, 80); t.pointer('pointermove', 2, 300, 100);
    expect(t.callbacks.pan).not.toHaveBeenCalled(); expect(t.callbacks.zoom).not.toHaveBeenCalled();
    expect(t.callbacks.start).not.toHaveBeenCalled(); expect(following).toBe(true);
    following = false;
    t.pointer('pointerdown', 1, 100, 100); t.pointer('pointermove', 1, 80, 80);
    expect(t.callbacks.pan).toHaveBeenCalledWith(20, 20);
    t.pointer('pointerdown', 2, 200, 80); t.pointer('pointermove', 2, 300, 80);
    expect(t.callbacks.zoom).toHaveBeenCalledOnce();
    following = true; t.callbacks.pan.mockClear(); t.callbacks.zoom.mockClear();
    t.pointer('pointermove', 1, 50, 50);
    expect(t.capture.size).toBe(0); expect(t.callbacks.pan).not.toHaveBeenCalled(); expect(t.callbacks.zoom).not.toHaveBeenCalled();
    t.gestures.destroy();
  });
  it('keeps shared controllers interactive while the room is ready, but locks loading views', () => {
    const t = setup(); let ready = true;
    t.callbacks.locked.mockImplementation(() => !canInteractWithDocument(ready, true, true));
    t.pointer('pointerdown', 1, 100, 100); t.pointer('pointermove', 1, 80, 80);
    expect(t.callbacks.pan).toHaveBeenCalledWith(20, 20);
    ready = false; t.callbacks.pan.mockClear(); t.pointer('pointermove', 1, 50, 50);
    expect(t.callbacks.pan).not.toHaveBeenCalled(); expect(t.capture.size).toBe(0);
    expect(canInteractWithDocument(false, false, false)).toBe(false);
    t.gestures.destroy();
  });
  it('drags in both axes, captures the pointer, and finishes cleanly', () => {
    const t = setup();
    expect(t.pointer('pointerdown', 1, 200, 300).defaultPrevented).toBe(true);
    expect(t.capture.has(1)).toBe(true);
    t.pointer('pointermove', 1, 150, 240);
    expect(t.callbacks.pan).toHaveBeenCalledWith(50, 60);
    t.pointer('pointerup', 1, 150, 240);
    expect(t.capture.size).toBe(0); expect(t.classes.has('dragging')).toBe(false);
    expect(t.callbacks.end).toHaveBeenCalledOnce(); t.gestures.destroy();
  });
  it('pinches around the moving midpoint and resumes one-finger drag without jumping', () => {
    const t = setup();
    t.pointer('pointerdown', 1, 100, 100); t.pointer('pointerdown', 2, 200, 100);
    t.pointer('pointermove', 2, 300, 100);
    expect(t.callbacks.zoom).toHaveBeenCalledWith(2, { x: 150, y: 100 }, { x: 200, y: 100 });
    expect(t.callbacks.pan).not.toHaveBeenCalled();
    t.pointer('pointercancel', 2, 300, 100);
    t.pointer('pointermove', 1, 90, 80);
    expect(t.callbacks.pan).toHaveBeenCalledWith(10, 20);
    t.gestures.destroy(); expect(t.capture.size).toBe(0);
  });
  it('keeps Followers locked and prevents document/browser zoom on Ctrl+wheel', () => {
    const t = setup(); t.callbacks.locked.mockReturnValue(true);
    t.pointer('pointerdown', 1, 100, 100);
    const wheel = Object.assign(new Event('wheel', { cancelable: true }), { ctrlKey: true, deltaY: -100, deltaMode: 0, clientX: 110, clientY: 120 });
    t.target.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(t.callbacks.start).not.toHaveBeenCalled(); expect(t.callbacks.zoom).not.toHaveBeenCalled();
    t.callbacks.locked.mockReturnValue(false);
    t.target.dispatchEvent(wheel);
    expect(t.callbacks.zoom).toHaveBeenCalledWith(Math.exp(.5), { x: 100, y: 100 }, { x: 100, y: 100 });
    t.gestures.destroy(); t.callbacks.zoom.mockClear();
    t.target.dispatchEvent(wheel); expect(t.callbacks.zoom).not.toHaveBeenCalled();
  });
  it('leaves page retry buttons clickable instead of capturing their pointer', () => {
    const t = setup();
    Object.assign(t.target, { closest: () => ({ tagName: 'BUTTON' }) });
    expect(t.pointer('pointerdown', 1, 100, 100).defaultPrevented).toBe(false);
    expect(t.capture.size).toBe(0); expect(t.callbacks.start).not.toHaveBeenCalled();
    t.gestures.destroy();
  });
  it('keeps taps on links clickable, including small finger movement', () => {
    const t = setup();
    Object.assign(t.target, { closest: (selector: string) => selector === 'a' ? {} : null });
    expect(t.pointer('pointerdown', 1, 100, 100).defaultPrevented).toBe(false);
    t.pointer('pointermove', 1, 103, 104);
    t.pointer('pointerup', 1, 103, 104);
    const click = Object.assign(new Event('click', { cancelable: true }), { detail: 1 });
    t.target.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(t.capture.size).toBe(0);
    expect(t.callbacks.start).not.toHaveBeenCalled();
    expect(t.callbacks.pan).not.toHaveBeenCalled();
    expect(t.callbacks.end).not.toHaveBeenCalled();
    t.gestures.destroy();
  });
  it('drags from a link, blocks accidental navigation, and allows the next tap', () => {
    const t = setup();
    Object.assign(t.target, { closest: (selector: string) => selector === 'a' ? {} : null });
    t.pointer('pointerdown', 1, 100, 100);
    t.pointer('pointermove', 1, 80, 70);
    expect(t.callbacks.pan).toHaveBeenCalledWith(20, 30);
    expect(t.capture.has(1)).toBe(true);
    t.pointer('pointerup', 1, 80, 70);
    const click = Object.assign(new Event('click', { cancelable: true }), { detail: 1 });
    t.target.dispatchEvent(click); expect(click.defaultPrevented).toBe(true);
    const keyboard = Object.assign(new Event('click', { cancelable: true }), { detail: 0 });
    t.target.dispatchEvent(keyboard); expect(keyboard.defaultPrevented).toBe(false);
    t.pointer('pointerdown', 2, 80, 70); t.pointer('pointerup', 2, 80, 70);
    const tap = Object.assign(new Event('click', { cancelable: true }), { detail: 1 });
    t.target.dispatchEvent(tap); expect(tap.defaultPrevented).toBe(false);
    t.gestures.destroy();
  });
  it('pinches when both fingers begin on links and survives implicit capture transfer', () => {
    const t = setup();
    Object.assign(t.target, { closest: (selector: string) => selector === 'a' ? {} : null });
    t.pointer('pointerdown', 1, 100, 100);
    t.pointer('pointerdown', 2, 200, 100);
    expect(t.capture.size).toBe(2);
    const lost = Object.assign(new Event('lostpointercapture'), { pointerId: 1 });
    Object.defineProperty(lost, 'target', { value: { tagName: 'A' } });
    t.target.dispatchEvent(lost);
    t.pointer('pointermove', 2, 300, 100);
    expect(t.callbacks.zoom).toHaveBeenCalledWith(2, { x: 150, y: 100 }, { x: 200, y: 100 });
    t.pointer('pointerup', 2, 300, 100); t.pointer('pointerup', 1, 100, 100);
    const click = Object.assign(new Event('click', { cancelable: true }), { detail: 1 });
    t.target.dispatchEvent(click); expect(click.defaultPrevented).toBe(true);
    expect(t.callbacks.start).toHaveBeenCalledOnce(); expect(t.callbacks.end).toHaveBeenCalledOnce();
    t.gestures.destroy();
  });
});
