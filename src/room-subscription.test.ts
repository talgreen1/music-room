import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { subscribeRoomWithRecovery } from './room-subscription';
let stop: () => void;
beforeEach(() => vi.useFakeTimers());
afterEach(() => { stop?.(); vi.useRealTimers(); });
function fixture() {
  const subscriptions: { value: (value: unknown) => void; error: (error: unknown) => void; off: ReturnType<typeof vi.fn> }[] = [];
  const subscribe = vi.fn((value, error) => { const off = vi.fn(); subscriptions.push({ value, error, off }); return off; });
  const refresh = vi.fn().mockResolvedValue(undefined), value = vi.fn(), error = vi.fn(), recovery = vi.fn();
  stop = subscribeRoomWithRecovery({ subscribe, refresh, value, error, recovery });
  return { subscriptions, subscribe, refresh, value, error, recovery };
}
const denied = () => Object.assign(new Error('permission_denied at /rooms/123456'), { code: 'PERMISSION_DENIED' });
it('replaces an initially denied listener once after credential refresh and a bounded propagation delay', async () => {
  const t = fixture(); t.subscriptions[0].error(denied());
  expect(t.subscriptions[0].off).toHaveBeenCalledOnce(); expect(t.refresh).toHaveBeenCalledOnce(); expect(t.error).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(249); expect(t.subscribe).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1); expect(t.subscribe).toHaveBeenCalledTimes(2);
  expect(t.recovery.mock.calls.flat()).toEqual(['authentication refresh', 'room subscription retry']);
  t.subscriptions[0].value('obsolete'); expect(t.value).not.toHaveBeenCalled();
  t.subscriptions[1].value('room'); expect(t.value).toHaveBeenCalledExactlyOnceWith('room');
});
it('shows the final error without retry loops when permission remains denied', async () => {
  const t = fixture(); t.subscriptions[0].error(denied()); await vi.advanceTimersByTimeAsync(250);
  const last = denied(); t.subscriptions[1].error(last); await vi.advanceTimersByTimeAsync(60000);
  expect(t.refresh).toHaveBeenCalledOnce(); expect(t.subscribe).toHaveBeenCalledTimes(2); expect(t.error).toHaveBeenCalledExactlyOnceWith(last);
});
it('does not refresh arbitrary network failures or later revocation/expiry after a room snapshot', () => {
  const t = fixture(), network = Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' }); t.subscriptions[0].error(network);
  expect(t.refresh).not.toHaveBeenCalled(); expect(t.error).toHaveBeenCalledWith(network);
  stop(); const next = fixture(); next.subscriptions[0].value(null); next.subscriptions[0].error(denied());
  expect(next.refresh).not.toHaveBeenCalled(); expect(next.error).toHaveBeenCalledOnce();
});
it('cancels a pending refresh and its delayed retry when the room is left or replaced', async () => {
  const t = fixture(); let complete!: () => void; t.refresh.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
  t.subscriptions[0].error(denied()); const signal = t.refresh.mock.calls[0][0] as AbortSignal; stop(); expect(signal.aborted).toBe(true);
  complete(); await vi.advanceTimersByTimeAsync(1000); expect(t.subscribe).toHaveBeenCalledOnce(); expect(t.error).not.toHaveBeenCalled();
  const next = fixture(); next.subscriptions[0].error(denied()); await vi.advanceTimersByTimeAsync(0); stop();
  await vi.advanceTimersByTimeAsync(1000); expect(next.subscribe).toHaveBeenCalledOnce();
});
it('preserves refresh failure details and never retries after the refresh fails', async () => {
  const t = fixture(), cause = Object.assign(new Error('session lost'), { code: 'room/identity-changed' });
  t.refresh.mockRejectedValueOnce(cause); t.subscriptions[0].error(denied()); await vi.advanceTimersByTimeAsync(1000);
  expect(t.subscribe).toHaveBeenCalledOnce(); expect(t.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'room/auth-recovery-failed', cause }));
});
