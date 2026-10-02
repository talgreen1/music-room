import { afterEach, expect, it, vi } from 'vitest';
import { PositionPublisher } from './sync';
const p = (page: number) => ({ page, offset: 0, zoom: 1 });
afterEach(() => vi.useRealTimers());
it('coalesces a slow write and sends the final position', async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const send = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
  const publisher = new PositionPublisher(send, vi.fn(), 70);
  publisher.push(p(1)); await vi.advanceTimersByTimeAsync(0);
  publisher.push(p(2)); publisher.push(p(3));
  await vi.advanceTimersByTimeAsync(200); expect(send).toHaveBeenCalledTimes(1);
  release(); await vi.advanceTimersByTimeAsync(1);
  expect(send).toHaveBeenLastCalledWith(p(3)); publisher.stop();
});
it('caps ordinary writes and cancels pending work on leaving', async () => {
  vi.useFakeTimers(); const send = vi.fn().mockResolvedValue(undefined);
  const publisher = new PositionPublisher(send, vi.fn(), 70);
  publisher.push(p(1)); await vi.advanceTimersByTimeAsync(0);
  publisher.push(p(2)); await vi.advanceTimersByTimeAsync(30); publisher.push(p(3));
  await vi.advanceTimersByTimeAsync(40); expect(send).toHaveBeenCalledTimes(2); expect(send).toHaveBeenLastCalledWith(p(3));
  publisher.push(p(4)); publisher.stop(); await vi.advanceTimersByTimeAsync(200); expect(send).toHaveBeenCalledTimes(2);
});
