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
it('queues a final pinch behind an in-flight update and waits for its own completion', async () => {
  vi.useFakeTimers(); let first!: () => void, last!: () => void;
  const send = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { first = resolve; })).mockImplementationOnce(() => new Promise<void>(resolve => { last = resolve; }));
  const publisher = new PositionPublisher(send, vi.fn(), 70);
  publisher.push(p(1)); await vi.advanceTimersByTimeAsync(0);
  const complete = vi.fn(); const final = publisher.finish(p(2)).then(complete);
  await vi.advanceTimersByTimeAsync(10); expect(send).toHaveBeenCalledTimes(1); expect(complete).not.toHaveBeenCalled();
  first(); await vi.advanceTimersByTimeAsync(0); expect(send).toHaveBeenLastCalledWith(p(2)); expect(complete).not.toHaveBeenCalled();
  last(); await final; expect(complete).toHaveBeenCalledWith(true); publisher.stop();
});
it('resolves a final update as failed on send errors or cancellation without retry loops', async () => {
  vi.useFakeTimers(); const error = new Error('maxretry'), report = vi.fn();
  const send = vi.fn().mockRejectedValue(error), publisher = new PositionPublisher(send, report, 70);
  const final = publisher.finish(p(1)); await vi.advanceTimersByTimeAsync(0); expect(await final).toBe(false);
  expect(report).toHaveBeenCalledWith(error); expect(send).toHaveBeenCalledTimes(1);
  const cancelled = publisher.finish(p(2)); publisher.stop(); expect(await cancelled).toBe(false);
  expect(await publisher.finish(p(3))).toBe(false);
});
