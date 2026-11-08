// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RoomLoading } from './room-loading';
let loading: RoomLoading;
beforeEach(() => vi.useFakeTimers());
afterEach(() => { loading?.destroy(); vi.useRealTimers(); });
it('uses indeterminate connection/unknown download bars and real PDF byte/page progress', () => {
  loading = new RoomLoading(vi.fn()); loading.connection('authentication', 'Connecting securely…');
  const [connection, pdf] = loading.element.querySelectorAll('progress');
  expect(connection.hasAttribute('value')).toBe(false);
  loading.startDocument(); loading.progress({ stage: 'download', loaded: 1e6 });
  expect(pdf.hasAttribute('value')).toBe(false); expect(loading.element.textContent).toContain('1.0 MB');
  loading.progress({ stage: 'download', loaded: 1e6, total: 2e6 }); expect(pdf.value).toBe(.5);
  expect(loading.element.textContent).toContain('50%');
  loading.connection('connected', 'Connected', true); expect(loading.element.hidden).toBe(false);
  loading.progress({ stage: 'prepare', loaded: 2, total: 4 }); expect(pdf.value).toBe(.5);
  expect(loading.element.textContent).toContain('Preparing PDF pages: 2 / 4');
  loading.documentDone(); expect(loading.element.hidden).toBe(true);
});
it('times out waiting for room data, without resetting the deadline for repeated connection statuses', async () => {
  const fail = vi.fn(); loading = new RoomLoading(fail); loading.connection('room lookup', 'Connecting…');
  await vi.advanceTimersByTimeAsync(20000); loading.connection('room lookup', 'Connecting…');
  await vi.advanceTimersByTimeAsync(10000); expect(fail).toHaveBeenCalledOnce();
  expect(fail.mock.calls[0][0].code).toBe('room/connection-timeout');
});
it('measures document inactivity rather than total duration or repeated identical callbacks', async () => {
  const fail = vi.fn(); loading = new RoomLoading(fail); loading.connection('done', 'Connected', true); loading.startDocument();
  loading.progress({ stage: 'download', loaded: 1 }); await vi.advanceTimersByTimeAsync(40000);
  loading.progress({ stage: 'download', loaded: 2 }); await vi.advanceTimersByTimeAsync(40000); expect(fail).not.toHaveBeenCalled();
  loading.progress({ stage: 'download', loaded: 2 }); await vi.advanceTimersByTimeAsync(5000);
  expect(fail.mock.calls[0][0].code).toBe('document/load-timeout');
});
it('cleans up deadlines on completion, errors and navigation', async () => {
  const fail = vi.fn(); loading = new RoomLoading(fail); loading.connection('room', 'Connecting…'); loading.startDocument();
  loading.stop(); await vi.advanceTimersByTimeAsync(60000); expect(fail).not.toHaveBeenCalled();
  loading.connection('retry', 'Connecting…'); loading.startDocument(); loading.destroy();
  loading.connection('late', 'Connecting…'); loading.progress({ stage: 'download', loaded: 1 });
  await vi.advanceTimersByTimeAsync(60000); expect(fail).not.toHaveBeenCalled(); expect(loading.element.hidden).toBe(true);
});
