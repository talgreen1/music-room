import { afterEach, describe, expect, it, vi } from 'vitest';
import { FollowerSync } from './follower-sync';

function setup() {
  vi.useFakeTimers();
  const change = vi.fn(), resume = vi.fn();
  return { change, resume, sync: new FollowerSync(change, resume) };
}
afterEach(() => vi.useRealTimers());
describe('Follower sync preference', () => {
  it('discards browsing timers and held gestures when entering/releasing shared control', () => {
    const t = setup(); t.sync.begin(); t.sync.end();
    t.sync.reset(false); vi.advanceTimersByTime(5000);
    expect(t.resume).not.toHaveBeenCalled();
    t.sync.begin(); // An old interaction must not survive a role transition.
    t.sync.reset(true); expect(t.resume).toHaveBeenCalledOnce();
    t.sync.begin(); t.sync.end(); vi.advanceTimersByTime(3000);
    expect(t.resume).toHaveBeenCalledTimes(2);
  });
  it('returns to the latest Master view three seconds after browsing ends', () => {
    const t = setup(); t.sync.begin();
    expect(t.change).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(5000); expect(t.resume).not.toHaveBeenCalled();
    t.sync.end(); vi.advanceTimersByTime(2999); expect(t.resume).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(t.change).toHaveBeenLastCalledWith(true); expect(t.resume).toHaveBeenCalledOnce();
  });
  it('restarts the timeout with further interaction and waits for overlapping gestures', () => {
    const t = setup(); t.sync.begin(); t.sync.end(); vi.advanceTimersByTime(2500);
    t.sync.begin(); t.sync.begin(); t.sync.end();
    vi.advanceTimersByTime(5000); expect(t.resume).not.toHaveBeenCalled();
    t.sync.end(); vi.advanceTimersByTime(3000); expect(t.resume).toHaveBeenCalledOnce();
  });
  it('keeps a manual opt-out off across browsing and the pending timeout', () => {
    const t = setup(); t.sync.begin(); t.sync.end();
    t.sync.setManual(false); vi.advanceTimersByTime(5000);
    t.sync.begin(); t.sync.end(); vi.advanceTimersByTime(5000);
    expect(t.change).toHaveBeenLastCalledWith(false); expect(t.resume).not.toHaveBeenCalled();
    t.sync.setManual(true);
    expect(t.change).toHaveBeenLastCalledWith(true); expect(t.resume).toHaveBeenCalledOnce();
  });
  it('manual rechecking returns immediately and cancels the old timer', () => {
    const t = setup(); t.sync.begin(); t.sync.end();
    t.sync.setManual(true); vi.advanceTimersByTime(4000);
    expect(t.resume).toHaveBeenCalledOnce();
    t.sync.begin(); t.sync.end(); vi.advanceTimersByTime(3000);
    expect(t.resume).toHaveBeenCalledTimes(2);
  });
  it('never resumes after leaving or losing the room', () => {
    const t = setup(); t.sync.begin(); t.sync.end(); t.sync.destroy();
    vi.advanceTimersByTime(4000); t.sync.setManual(true); t.sync.begin(); t.sync.end();
    vi.advanceTimersByTime(4000); expect(t.resume).not.toHaveBeenCalled();
  });
});
