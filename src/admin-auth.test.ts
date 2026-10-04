import { describe, expect, it } from 'vitest';
import { AdminSessions } from '../server/admin-auth';
import { LocalRoomStore } from '../server/local-rooms';
import { validateSongbook, validatePdfUpload, MAX_PDF_BYTES } from './songbook';

describe('Settings authorization and management', () => {
  it('rejects oversized uploads and renamed non-PDF files', () => {
    const pdf = new TextEncoder().encode('%PDF-1.7\n');
    expect(() => validatePdfUpload(100, pdf)).not.toThrow();
    expect(() => validatePdfUpload(MAX_PDF_BYTES + 1, pdf)).toThrow('30 MB');
    expect(() => validatePdfUpload(100, new TextEncoder().encode('<html>'))).toThrow('not a PDF');
    expect(() => validatePdfUpload(0, pdf)).toThrow();
  });
  it('rejects missing/forged sessions and expires or revokes real sessions', () => {
    let now = 1000; const auth = new AdminSessions('test-password', () => now);
    expect(auth.authorized()).toBe(false);
    expect(auth.authorized(`music_admin=${'a'.repeat(64)}`)).toBe(false);
    expect(() => auth.login('wrong', 'ip')).toThrow('Incorrect');
    const token = auth.login('test-password', 'ip'); const cookie = `music_admin=${token}`;
    expect(auth.authorized(cookie)).toBe(true); auth.logout(cookie); expect(auth.authorized(cookie)).toBe(false);
    const next = auth.login('test-password', 'ip'); now += 3600001;
    expect(auth.authorized(`music_admin=${next}`)).toBe(false);
  });
  it('limits failed attempts and allows login after the cooldown', () => {
    let now = 1000; const auth = new AdminSessions('test-password', () => now);
    for (let i = 0; i < 5; i++) expect(() => auth.login('wrong', 'ip')).toThrow('Incorrect');
    expect(() => auth.login('test-password', 'ip')).toThrow('Too many');
    now += 300001; expect(auth.login('test-password', 'ip')).toHaveLength(64);
  });
  it('lists rooms and deletion notifies participants without leaking creator tokens', () => {
    let code = 100000; const store = new LocalRoomStore(() => 1000, () => String(code++));
    const descriptor = { masterId: 'master', pdfUrl: '/book.pdf', pdfVersion: 'v1', pdfTitle: 'Book' };
    const one = store.create(descriptor), two = store.create(descriptor);
    expect(Object.keys(store.list())).toHaveLength(2);
    expect(JSON.stringify(store.list())).not.toContain(one.token);
    const events: unknown[] = []; store.subscribe(one.code, room => events.push(room));
    store.delete(one.code); expect(events.at(-1)).toBeNull(); expect(store.read(two.code)).not.toBeNull();
    store.delete(); expect(store.list()).toEqual({});
  });
  it('accepts PDF URLs/paths while rejecting executable URLs and invalid metadata', () => {
    const value = { pdfUrl: '/book.pdf', pdfVersion: 'v1', pdfTitle: 'Book' };
    expect(validateSongbook(value)).toEqual(value);
    for (const pdfUrl of ['javascript:alert(1)', '//untrusted.test/book.pdf', 'http://remote.test/book.pdf']) expect(() => validateSongbook({ ...value, pdfUrl })).toThrow();
    expect(() => validateSongbook({ ...value, pdfVersion: '' })).toThrow();
    expect(validateSongbook({ ...value, pdfUrl: 'https://example.com/book.pdf' }).pdfUrl).toContain('https://');
  });
});
