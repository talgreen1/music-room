import { describe, expect, it } from 'vitest';
import { migrationChanges } from '../scripts/github-migration-plan.mjs';
const previousId = 'a'.repeat(32), id = 'b'.repeat(32), origin = 'https://files.example', uid = 'settings';
const source = { id: previousId, title: 'Song', ownerId: 'musician', roomCode: '123456', createdAt: 10, fileNames: ['song.pdf'], pdfUrl: 'https://legacy.example/song.pdf' };
const songbook = { pdfUrl: 'https://legacy.example/original.pdf', pdfVersion: 'old', pdfTitle: 'Original' };
const urls = [`${origin}/files/${uid}/${id}/42-document.pdf`];
describe('verified-file migration metadata plan', () => {
  it('maps defaults, preserves attribution and keeps old records as tombstones without changing rooms', () => {
    const snapshot = { songs: { [previousId]: source }, songbook, defaultFile: previousId };
    const result = migrationChanges(snapshot, [{ previousId, id, urls }], undefined, 100, origin, uid);
    expect(result).toEqual({ [`songs/${id}`]: { ...source, id, ownerId: uid, pdfUrl: urls[0] }, [`songs/${previousId}/deletedAt`]: 100, defaultFile: id, 'storageConfig/githubOrigin': origin });
    expect(snapshot.songs[previousId]).toEqual(source);
  });
  it('replaces original immutably without changing another selected default', () => {
    const result = migrationChanges({ songs: {}, songbook, defaultFile: id }, [], urls[0], 100, origin, uid);
    expect(result.songbook).toEqual({ ...songbook, pdfUrl: urls[0], pdfVersion: 'github-100' });
    expect(result).not.toHaveProperty('defaultFile');
  });
  it('keeps stitched tile geometry and order when copying images', () => {
    const image = { id: previousId, ownerId: 'musician', title: 'Images', segments: [{ url: 'https://legacy.example/0.jpg', width: 900, height: 1200 }, { url: 'https://legacy.example/1.jpg', width: 900, height: 1000 }] };
    const urls = [0, 1].map(index => `${origin}/files/${uid}/${id}/${42 + index}-${index}.jpg`);
    const result = migrationChanges({ songs: { [previousId]: image }, defaultFile: 'pdf' }, [{ previousId, id, urls }], undefined, 100, origin, uid);
    expect(result[`songs/${id}`].segments).toEqual(image.segments.map((segment, index) => ({ ...segment, url: urls[index] })));
  });
  it('rejects reused IDs, deleted entries, wrong providers and incomplete copies', () => {
    const snapshot = { songs: { [previousId]: source }, songbook, defaultFile: 'pdf' };
    for (const copy of [{ previousId, id: previousId, urls }, { previousId, id, urls: [] }, { previousId, id, urls: ['https://wrong.example/file.pdf'] }]) expect(() => migrationChanges(snapshot, [copy], undefined, 100, origin, uid)).toThrow();
    expect(() => migrationChanges({ ...snapshot, songs: { [previousId]: { ...source, deletedAt: 1 } } }, [{ previousId, id, urls }], undefined, 100, origin, uid)).toThrow();
  });
});
