// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { recordSyncDiagnostic } from './sync-diagnostics';
afterEach(() => { history.replaceState({}, '', '/'); delete window.musicRoomSyncDiagnostics; vi.restoreAllMocks(); });
it('records only when opted in and bounds the diagnostic history', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  recordSyncDiagnostic({ event: 'pinch-start' }); expect(window.musicRoomSyncDiagnostics).toBeUndefined();
  history.replaceState({}, '', '/?room=123456&syncDebug=1');
  for (let n = 0; n < 60; n++) recordSyncDiagnostic({ event: 'remote-deferred', sequence: n });
  expect(window.musicRoomSyncDiagnostics).toHaveLength(50);
  expect(window.musicRoomSyncDiagnostics![0].sequence).toBe(10);
  expect(JSON.stringify(window.musicRoomSyncDiagnostics)).not.toContain('123456');
});
