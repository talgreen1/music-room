// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startDiagnosticUpload } from './diagnostic-upload';
import { recordSyncDiagnostic } from './sync-diagnostics';
let stop: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:00Z')); history.replaceState({}, '', '/?room=123456&syncDebug=1'); vi.spyOn(console, 'debug').mockImplementation(() => {}); });
afterEach(() => { stop?.(); stop = undefined; history.replaceState({}, '', '/'); delete window.musicRoomSyncDiagnostics; vi.useRealTimers(); vi.restoreAllMocks(); });
it('uploads a bounded whitelisted snapshot without developer tools and cleans up on leave', async () => {
  const send = vi.fn().mockResolvedValue(undefined); stop = startDiagnosticUpload(Date.now(), send);
  for (let n = 0; n < 80; n++) recordSyncDiagnostic({ event: 'remote-deferred', sequence: n });
  await vi.advanceTimersByTimeAsync(4999); expect(send).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(send).toHaveBeenCalledOnce();
  const report = send.mock.calls[0][0]; expect(report.events).toHaveLength(50); expect(report.batch).toBe(1);
  expect(report.events[0].sequence).toBe(30); expect(JSON.stringify(report)).not.toContain('123456');
  stop(); recordSyncDiagnostic({ event: 'pinch-start' }); await vi.advanceTimersByTimeAsync(10000); expect(send).toHaveBeenCalledOnce();
});
it('keeps one write in flight and retries failed writes on later ticks without affecting gestures', async () => {
  let finish!: () => void;
  const send = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
  stop = startDiagnosticUpload(Date.now(), send); await vi.advanceTimersByTimeAsync(5000);
  recordSyncDiagnostic({ event: 'pinch-start' }); await vi.advanceTimersByTimeAsync(10000); expect(send).toHaveBeenCalledOnce();
  finish(); await vi.advanceTimersByTimeAsync(5000); expect(send).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(5000); expect(send).toHaveBeenCalledTimes(3);
  expect(send.mock.calls[1][0].batch).toBe(2); expect(send.mock.calls[2][0].batch).toBe(2);
});
it('stays off without the flag and caps failed attempts at 120', async () => {
  history.replaceState({}, '', '/?room=123456'); const send = vi.fn().mockRejectedValue(new Error('Denied'));
  stop = startDiagnosticUpload(Date.now(), send); recordSyncDiagnostic({ event: 'pinch-start' }); await vi.advanceTimersByTimeAsync(10000); expect(send).not.toHaveBeenCalled(); stop();
  history.replaceState({}, '', '/?room=123456&syncDebug=1'); stop = startDiagnosticUpload(Date.now(), send);
  await vi.advanceTimersByTimeAsync(700000); expect(send).toHaveBeenCalledTimes(120);
});
