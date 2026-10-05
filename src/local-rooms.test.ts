import { describe, expect, it } from 'vitest';
import { LocalRoomStore } from '../server/local-rooms';
const descriptor = { masterId: 'creator', pdfUrl: '/songbook.pdf', pdfVersion: 'one', pdfTitle: 'Book' };
describe('shared local development rooms', () => {
  it('atomically switches sheets, rejects Followers and rejects stale source positions', () => {
    const store = new LocalRoomStore(); const created = store.create(descriptor);
    const sheet = { id: 'a'.repeat(32), title: 'Chords', segments: [{ url: '/api/sheets/image.jpg', width: 960, height: 2000 }] };
    expect(store.changeSheet(created.code, 'follower', sheet)).toBe('forbidden');
    expect(store.read(created.code)?.sheet).toBeUndefined();
    const sources: string[] = [];
    store.subscribe(created.code, room => { if (room) { expect(room.position.sourceId || 'pdf').toBe(room.sheet?.id || 'pdf'); sources.push(room.position.sourceId || 'pdf'); } });
    expect(store.changeSheet(created.code, created.token, sheet)).toBe('ok');
    const position = { page: 1, offset: .4, horizontal: .7, zoom: 2 };
    expect(store.publish(created.code, created.token, position)).toBe('invalid');
    expect(store.publish(created.code, created.token, { ...position, sourceId: sheet.id })).toBe('ok');
    expect(store.read(created.code)?.position).toMatchObject(position);
    expect(store.changeSheet(created.code, created.token)).toBe('ok');
    expect(store.publish(created.code, created.token, { ...position, sourceId: sheet.id })).toBe('invalid');
    expect(store.read(created.code)?.pdfUrl).toBe(descriptor.pdfUrl);
    expect(sources).toEqual(['pdf', sheet.id, sheet.id, 'pdf']);
  });
  it('rejects malformed sheet replacements without losing the current content', () => {
    const store = new LocalRoomStore(); const created = store.create(descriptor);
    for (const value of [false, '', 0, { id: 'bad' }]) expect(store.changeSheet(created.code, created.token, value as never)).toBe('invalid');
    expect(store.read(created.code)?.position.sequence).toBe(0);
  });
  it('shares rooms with independent clients without exposing the Master token', () => {
    const store = new LocalRoomStore(); const created = store.create(descriptor);
    expect(store.read(created.code)?.masterId).toBe('creator');
    expect(store.read(created.code)).not.toHaveProperty('token');
    expect(created.token).toHaveLength(64);
  });
  it('denies Follower writes and streams the Master position', () => {
    const store = new LocalRoomStore(); const created = store.create(descriptor);
    const received: number[] = []; const unsubscribe = store.subscribe(created.code, room => received.push(room!.position.page));
    const position = { page: 37, offset: .6, zoom: 1.1 };
    expect(store.publish(created.code, '', position)).toBe('forbidden');
    expect(store.publish(created.code, 'wrong-token', position)).toBe('forbidden');
    expect(store.publish(created.code, created.token, position)).toBe('ok');
    expect(received).toEqual([1, 37]); expect(store.read(created.code)?.position.sequence).toBe(1);
    unsubscribe(); store.publish(created.code, created.token, { ...position, page: 50 }); expect(received).toEqual([1, 37]);
  });
  it('rejects malformed positions and expires rooms on server time', () => {
    let now = 100000; const store = new LocalRoomStore(() => now); const created = store.create(descriptor);
    expect(store.publish(created.code, created.token, { page: 1, offset: NaN, zoom: 1 })).toBe('invalid');
    let expired = false; store.subscribe(created.code, room => { if (!room) expired = true; });
    now += 86400000; expect(store.read(created.code)).toBeNull(); store.prune(); expect(expired).toBe(true);
    expect(store.publish(created.code, created.token, { page: 1, offset: 0, zoom: 1 })).toBe('missing');
  });
  it('retries collisions without overwriting an existing room', () => {
    const codes = ['123456', '123456', '654321']; const store = new LocalRoomStore(Date.now, () => codes.shift()!);
    expect(store.create(descriptor).code).toBe('123456'); expect(store.create({ ...descriptor, masterId: 'second' }).code).toBe('654321');
    expect(store.read('123456')?.masterId).toBe('creator');
  });
  it('streams two-axis positions and validates the expanded zoom range', () => {
    const store = new LocalRoomStore(); const created = store.create(descriptor);
    const position = { page: 37, offset: .6, zoom: 3, horizontal: .75 };
    let latest;
    store.subscribe(created.code, room => { latest = room?.position; });
    expect(store.publish(created.code, created.token, position)).toBe('ok');
    expect(latest).toMatchObject(position);
    expect(store.read(created.code)?.position).toMatchObject(position);
    for (const horizontal of [NaN, Infinity, -1, 1.01]) expect(store.publish(created.code, created.token, { ...position, horizontal })).toBe('invalid');
    expect(store.publish(created.code, created.token, { ...position, zoom: 4.1 })).toBe('invalid');
    expect(store.publish(created.code, created.token, { page: 1, offset: 0, zoom: 1 })).toBe('ok');
    expect(store.read(created.code)?.position.horizontal).toBe(0);
  });
});
