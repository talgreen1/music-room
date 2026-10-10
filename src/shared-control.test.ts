import { describe, expect, it } from 'vitest';
import { LocalRoomStore } from '../server/local-rooms';

const book = { masterId: 'owner', pdfUrl: '/book.pdf', pdfTitle: 'Book', pdfVersion: '1' };
const position = { page: 4, offset: .4, horizontal: .8, zoom: 2, sourceId: 'pdf' };
describe('shared control permissions', () => {
  it('pending is not a grant; owner approval allows both participants to publish', () => {
    const store = new LocalRoomStore(), owner = store.create(book), member = store.join(owner.code)!;
    store.control(owner.code, member.token, 'request');
    expect(store.read(owner.code)?.controlRequests?.[member.memberId]).toBe(true);
    expect(store.publish(owner.code, member.token, position)).toBe('forbidden');
    expect(() => store.control(owner.code, member.token, 'approve', member.memberId)).toThrow();
    store.control(owner.code, owner.token, 'approve', member.memberId);
    expect(store.read(owner.code)?.controlRequests?.[member.memberId]).toBeUndefined();
    expect(store.publish(owner.code, member.token, position)).toBe('ok');
    expect(store.publish(owner.code, owner.token, { ...position, page: 5 })).toBe('ok');
    expect(store.read(owner.code)?.position).toMatchObject({ page: 5, sequence: 2 });
    expect(store.authorized(owner.code, member.token)).toBe(false);
  });
  it('controllers switch sources atomically but cannot approve other musicians', () => {
    const store = new LocalRoomStore(), owner = store.create(book), a = store.join(owner.code)!, b = store.join(owner.code)!;
    store.grantControl(owner.code, a.memberId); store.control(owner.code, b.token, 'request');
    expect(() => store.control(owner.code, a.token, 'approve', b.memberId)).toThrow();
    const sheet = { id: 'a'.repeat(32), title: 'Song', pdfUrl: '/song.pdf' };
    expect(store.changeSheet(owner.code, a.token, sheet, { page: 6, offset: .2 })).toBe('ok');
    expect(store.read(owner.code)).toMatchObject({ masterId: 'owner', sheet, position: { sourceId: sheet.id, page: 6, sequence: 1 } });
    expect(store.publish(owner.code, owner.token, position)).toBe('invalid');
    expect(store.publish(owner.code, a.token, { ...position, sourceId: sheet.id })).toBe('ok');
    expect(store.changeSheet(owner.code, a.token)).toBe('ok');
  });
  it('denial, cancellation and release leave followers read-only', () => {
    const store = new LocalRoomStore(), owner = store.create(book), member = store.join(owner.code)!;
    store.control(owner.code, member.token, 'request'); store.control(owner.code, member.token, 'release');
    expect(store.read(owner.code)?.controlRequests?.[member.memberId]).toBeUndefined();
    store.control(owner.code, member.token, 'request'); store.control(owner.code, owner.token, 'deny', member.memberId);
    expect(store.canControl(owner.code, member.token)).toBe(false);
    store.grantControl(owner.code, member.memberId); store.control(owner.code, member.token, 'release');
    expect(store.publish(owner.code, member.token, position)).toBe('forbidden');
    expect(store.changeSheet(owner.code, member.token)).toBe('forbidden');
  });
  it('tokens and grants cannot cross rooms or survive deletion, code reuse or expiry', () => {
    let now = 1; const store = new LocalRoomStore(() => now), owner = store.create(book), other = store.create(book), member = store.join(owner.code)!;
    expect(() => store.grantControl(other.code, member.memberId)).toThrow();
    expect(() => store.control(other.code, member.token, 'request')).toThrow();
    store.grantControl(owner.code, member.memberId); now += 86400000;
    expect(store.canControl(owner.code, member.token)).toBe(false);
    expect(() => store.grantControl(owner.code, member.memberId)).toThrow();
    const reused = new LocalRoomStore(Date.now, () => '123456'), first = reused.create(book), old = reused.join(first.code)!;
    reused.grantControl(first.code, old.memberId); reused.delete(first.code); reused.create(book);
    expect(reused.canControl(first.code, old.token)).toBe(false);
  });
});
