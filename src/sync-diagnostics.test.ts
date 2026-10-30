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
it('copies only approved geometry fields and does not retain caller mutations', () => {
  history.replaceState({}, '', '/?syncDebug=1'); vi.spyOn(console, 'debug').mockImplementation(() => {});
  const geometry = { anchorPage: 113, anchorOffset: .5, anchorTop: 1000, anchorHeight: 100, beforeTop: 0, targetTop: 1050, actualTop: 1050, targetLeft: 0, actualLeft: 0, scrollHeight: 5000, viewportHeight: 800, token: 'secret' };
  recordSyncDiagnostic({ event: 'pinch-layout', geometry }); geometry.actualTop = 9999;
  expect(window.musicRoomSyncDiagnostics![0].geometry?.actualTop).toBe(1050);
  expect(JSON.stringify(window.musicRoomSyncDiagnostics)).not.toContain('secret');
});
