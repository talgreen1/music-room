import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { DiagnosticStore } from '../server/diagnostic-store';
it('persists reports, rejects stale/rapid updates, expires them on administrator read and supports deletion', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'music-room-debug-')); let now = Date.now();
  const store = new DiagnosticStore(folder, () => now), session = 'a'.repeat(32);
  const report = { roomCreatedAt: now, createdAt: now, updatedAt: now, expiresAt: now + 86400000, batch: 1, platform: 'ios' as const, browser: 'safari' as const, events: [{ event: 'pinch-start' as const, at: now }] };
  try {
    await expect(store.save('123456', 'owner', session, report, now - 1)).rejects.toThrow();
    await store.save('123456', 'owner', session, report, now);
    expect((await new DiagnosticStore(folder, () => now).read('123456')).owner[session].batch).toBe(1);
    await expect(store.save('123456', 'owner', session, { ...report, batch: 2 }, now)).rejects.toThrow();
    now += 5000; await store.save('123456', 'owner', session, { ...report, updatedAt: now, batch: 2 }, report.roomCreatedAt);
    now += 86400000; expect(await store.read('123456')).toEqual({});
    now = Date.now(); await store.save('123456', 'owner', session, report, report.roomCreatedAt); await store.clear('123456'); expect(await store.read('123456')).toEqual({});
  } finally {
    if (dirname(resolve(folder)) !== resolve(tmpdir()) || !basename(folder).startsWith('music-room-debug-')) throw new Error('Unexpected test cleanup path.');
    await rm(folder, { recursive: true, force: true });
  }
});
