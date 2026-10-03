import { describe, expect, it, vi } from 'vitest';
import { PdfGestures } from './gestures';

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
});
