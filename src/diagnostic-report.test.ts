import { expect, it } from 'vitest';
import { appendDiagnostic, validateDiagnosticReport, type SyncDiagnostic } from './diagnostic-report';
export const geometry = { anchorPage: 113, anchorOffset: .5, anchorTop: 100000, anchorHeight: 1000, beforeTop: 50000, targetTop: 100500, actualTop: 100500, targetLeft: -20, actualLeft: 0, scrollHeight: 500000, viewportHeight: 800 };
const report = { roomCreatedAt: 1, createdAt: 1, updatedAt: 2, expiresAt: 86400001, batch: 1, platform: 'ios' as const, browser: 'safari' as const, events: [{ event: 'pinch-start' as const, at: 2 }] };
it('accepts only bounded event data and coarse browser/device metadata', () => {
  expect(validateDiagnosticReport(report)).toEqual(report);
  for (const change of [{ token: 'secret' }, { events: Array(51).fill(report.events[0]) }, { events: [{ event: 'pinch-start', at: 2, password: 'secret' }] }, { events: [{ event: 'raw-exception', at: 2 }] }, { events: [{ event: 'pinch-start', at: 2, zoom: 100 }] }, { batch: 121 }, { expiresAt: 999999999999 }, { browser: 'full user agent' }]) {
    expect(() => validateDiagnosticReport({ ...report, ...change } as any)).toThrow();
  }
});
it('accepts numeric layout traces and rejects secrets, missing metrics and invalid ranges', () => {
  const event = { event: 'pinch-layout' as const, at: 2, geometry };
  expect(validateDiagnosticReport({ ...report, events: [event] }).events[0].geometry).toEqual(geometry);
  for (const change of [{ token: 'secret' }, { anchorPage: 1.5 }, { anchorOffset: 2 }, { actualTop: Infinity }, { anchorHeight: 0 }, { beforeTop: undefined }]) {
    expect(() => validateDiagnosticReport({ ...report, events: [{ ...event, geometry: { ...geometry, ...change } as any }] })).toThrow();
  }
  expect(() => validateDiagnosticReport({ ...report, events: [{ ...event, event: 'pinch-start' }] })).toThrow();
});
it('keeps lifecycle events and only twelve detailed snapshots, below the 16KiB HTTP limit', () => {
  const entries: SyncDiagnostic[] = [];
  for (let n = 0; n < 70; n++) {
    appendDiagnostic(entries, { event: 'pinch-start', at: Number.MAX_SAFE_INTEGER });
    appendDiagnostic(entries, { event: 'pinch-layout', at: Number.MAX_SAFE_INTEGER, geometry: Object.fromEntries(Object.keys(geometry).map(key => [key, 999999999.9999999])) as any });
  }
  expect(entries).toHaveLength(50); expect(entries.filter(entry => entry.geometry)).toHaveLength(12);
  expect(new TextEncoder().encode(JSON.stringify({ ...report, events: entries })).length).toBeLessThan(16 * 1024);
});
