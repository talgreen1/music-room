import { expect, it } from 'vitest';
import { validateDiagnosticReport } from './diagnostic-report';
const report = { roomCreatedAt: 1, createdAt: 1, updatedAt: 2, expiresAt: 86400001, batch: 1, platform: 'ios' as const, browser: 'safari' as const, events: [{ event: 'pinch-start' as const, at: 2 }] };
it('accepts only bounded event data and coarse browser/device metadata', () => {
  expect(validateDiagnosticReport(report)).toEqual(report);
  for (const change of [{ token: 'secret' }, { events: Array(51).fill(report.events[0]) }, { events: [{ event: 'pinch-start', at: 2, password: 'secret' }] }, { events: [{ event: 'raw-exception', at: 2 }] }, { events: [{ event: 'pinch-start', at: 2, zoom: 100 }] }, { batch: 121 }, { expiresAt: 999999999999 }, { browser: 'full user agent' }]) {
    expect(() => validateDiagnosticReport({ ...report, ...change } as any)).toThrow();
  }
});
