import { describe, expect, it, vi } from 'vitest';
import { ControllerPinch } from './controller-pinch';
const position = { page: 4, offset: .3, zoom: 2 };
describe('controller pinch protection', () => {
  it('holds remote movement throughout a pinch and its final asynchronous write', async () => {
    const pinch = new ControllerPinch(); let complete!: (success: boolean) => void;
    const send = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve; }));
    expect(pinch.blocked).toBe(false); pinch.start(); expect(pinch.blocked).toBe(true);
    pinch.finish(position, send); expect(send).toHaveBeenCalledWith(position); expect(pinch.blocked).toBe(true);
    complete(true); await Promise.resolve(); expect(pinch.blocked).toBe(false);
  });
  it('does not let an old final write unlock a newer gesture', async () => {
    const pinch = new ControllerPinch(); let complete!: (success: boolean) => void;
    pinch.start(); pinch.finish(position, () => new Promise(resolve => { complete = resolve; }));
    pinch.start(); complete(true); await Promise.resolve(); expect(pinch.blocked).toBe(true);
    pinch.reset(); expect(pinch.blocked).toBe(false);
    const send = vi.fn(); pinch.finish(position, send); expect(send).not.toHaveBeenCalled();
  });
  it('releases protection after failed writes and after source/role/reconnect reset', async () => {
    const pinch = new ControllerPinch(); pinch.start(); pinch.finish(position, async () => false);
    await Promise.resolve(); expect(pinch.blocked).toBe(false);
    pinch.start(); pinch.finish(position, async () => { throw new Error('Offline'); });
    await Promise.resolve(); expect(pinch.blocked).toBe(false);
    pinch.start(); pinch.reset(); expect(pinch.blocked).toBe(false);
  });
});
