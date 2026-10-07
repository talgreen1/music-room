import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { SongLibrary } from '../server/song-library';
import { availableSongs, unusedDeletedSongs, roomUploads } from './song-library';
import type { Room } from './model';
const folders: string[] = [];
afterEach(async () => { for (const folder of folders.splice(0)) { if (!resolve(folder).startsWith(resolve(tmpdir()) + sep) || !basename(folder).startsWith('music-room-library-')) throw new Error('Unexpected test cleanup path.'); await rm(folder, { recursive: true, force: true }); } });
const sheet = { id: 'a'.repeat(32), title: 'My song', segments: [{ url: `/api/sheets/${'b'.repeat(32)}.jpg`, width: 480, height: 800 }] };
async function fixture() { const folder = await mkdtemp(join(tmpdir(), 'music-room-library-')); folders.push(folder); await mkdir(join(folder, 'sheets')); await writeFile(join(folder, 'sheets', `${'b'.repeat(32)}.jpg`), 'fixture'); return folder; }
describe('persistent saved songs', () => {
  it('identifies uploads by origin, uploader and room lifetime, excluding reused room codes', () => {
    const room: Room = { masterId: 'creator', createdAt: 1000, expiresAt: 2000, pdfUrl: '/book.pdf', pdfTitle: 'Book', pdfVersion: 'v1', position: { page: 1, offset: 0, zoom: 1, updatedAt: 1000 } };
    const song = { ...sheet, ownerId: 'creator', roomCode: '123456', createdAt: 1500 };
    expect(roomUploads([song, { ...song, createdAt: 900 }, { ...song, ownerId: 'other' }, { ...song, roomCode: undefined }, { ...song, deletedAt: 1600 }, { ...song, createdAt: 2100 }], { '123456': room })).toEqual([song]);
    expect(roomUploads([song], { '654321': { ...room, sheet } })).toEqual([]);
  });
  it('bulk room-file deletion preserves the default, unrelated uploads and active file bytes', async () => {
    const folder = await fixture(), library = new SongLibrary(folder, () => 1500);
    await library.save(sheet, 'creator', '123456');
    const defaultFile = { ...sheet, id: 'c'.repeat(32), title: 'Default' }, unrelated = { ...sheet, id: 'd'.repeat(32), title: 'Other room' };
    await library.save(defaultFile, 'creator', '123456'); await library.save(unrelated, 'creator', '654321'); await library.setDefault(defaultFile.id);
    await library.deleteMany([sheet.id, defaultFile.id]);
    expect((await new SongLibrary(folder).list()).map(file => file.id).sort()).toEqual([defaultFile.id, unrelated.id].sort());
    await library.cleanup(new Set([sheet.id])); expect(await readFile(join(folder, 'sheets', `${'b'.repeat(32)}.jpg`), 'utf8')).toBe('fixture');
    expect(await library.defaultFile()).toBe(defaultFile.id);
  });
  it('persists a Settings import without any room metadata', async () => {
    const folder = await fixture(), library = new SongLibrary(folder);
    await library.save(sheet, 'settings-admin');
    const [saved] = await new SongLibrary(folder).list();
    expect(saved.title).toBe(sheet.title); expect(saved.ownerId).toBe('settings-admin');
    expect(saved).not.toHaveProperty('roomCode');
  });
  it('keeps imports through server restarts and does not overwrite an existing song', async () => {
    const folder = await fixture(), library = new SongLibrary(folder, () => 1234);
    await library.save(sheet, 'creator', '123456');
    await expect(library.save({ ...sheet, title: 'Overwrite' }, 'creator', '123456')).rejects.toThrow('already');
    expect(await new SongLibrary(folder).list()).toMatchObject([{ ...sheet, createdAt: 1234, ownerId: 'creator' }]);
  });
  it('hides deletion immediately, preserves active copies, then removes unused files and metadata', async () => {
    const folder = await fixture(), library = new SongLibrary(folder, () => 1234);
    await library.save(sheet, 'creator', '123456'); await library.delete(sheet.id);
    expect(await library.get(sheet.id)).toBeUndefined(); expect(await library.list()).toEqual([]);
    await library.cleanup(new Set([sheet.id]));
    expect(await readFile(join(folder, 'sheets', `${'b'.repeat(32)}.jpg`), 'utf8')).toBe('fixture');
    expect(await new SongLibrary(folder).list()).toEqual([]);
    await library.cleanup(new Set());
    await expect(readFile(join(folder, 'sheets', `${'b'.repeat(32)}.jpg`))).rejects.toThrow();
    expect(JSON.parse(await readFile(join(folder, 'songs.json'), 'utf8'))).toEqual({ version: 2, defaultId: 'pdf', files: {} });
  });
  it('serializes concurrent writes without losing either song', async () => {
    const folder = await fixture(), library = new SongLibrary(folder);
    await Promise.all([library.save(sheet, 'creator', '123456'), library.save({ ...sheet, id: 'c'.repeat(32) }, 'creator', '123456')]);
    expect(await new SongLibrary(folder).list()).toHaveLength(2);
  });
  it('does not silently overwrite an unreadable catalog', async () => {
    const folder = await fixture(); await writeFile(join(folder, 'songs.json'), 'broken');
    const library = new SongLibrary(folder);
    await expect(library.list()).rejects.toThrow(); await expect(library.save(sheet, 'creator', '123456')).rejects.toThrow();
    expect(await readFile(join(folder, 'songs.json'), 'utf8')).toBe('broken');
  });
  it('filters tombstones and retains active deleted songs during cleanup', () => {
    const song = { ...sheet, ownerId: 'creator', roomCode: '123456', createdAt: 1000 };
    const records = { [song.id]: { ...song, deletedAt: 1500 }, other: { ...song, id: 'c'.repeat(32), title: 'Other' } };
    expect(availableSongs(records).map(value => value.title)).toEqual(['Other']);
    expect(unusedDeletedSongs(records, new Set([song.id]))).toEqual([]);
    expect(unusedDeletedSongs(records, new Set())).toHaveLength(1);
  });
  it('migrates existing image songs and persists a PDF default across restarts', async () => {
    const folder = await fixture();
    await writeFile(join(folder, 'songs.json'), JSON.stringify({ [sheet.id]: { ...sheet, ownerId: 'creator', createdAt: 1000 } }));
    const library = new SongLibrary(folder);
    expect(await library.defaultFile()).toBe('pdf');
    const pdf = { id: 'd'.repeat(32), title: 'Another book', pdfUrl: `/api/songbooks/${'e'.repeat(32)}.pdf` };
    await library.save(pdf, 'creator', '123456'); await library.setDefault(pdf.id);
    const restarted = new SongLibrary(folder);
    expect(await restarted.defaultFile()).toBe(pdf.id);
    expect(await restarted.list()).toHaveLength(2);
    await expect(restarted.delete(pdf.id)).rejects.toThrow('another default');
    await expect(restarted.setDefault('f'.repeat(32))).rejects.toThrow('available');
    expect(await restarted.defaultFile()).toBe(pdf.id);
    await restarted.setDefault(sheet.id);
    expect(await new SongLibrary(folder).defaultFile()).toBe(sheet.id);
  });
  it('keeps deleted PDFs in active rooms, then cleans up their stored bytes', async () => {
    const folder = await fixture(); await mkdir(join(folder, 'songbooks'));
    const filename = `${'e'.repeat(32)}.pdf`;
    await writeFile(join(folder, 'songbooks', filename), '%PDF-1.4');
    const pdf = { id: 'd'.repeat(32), title: 'Book', pdfUrl: `/api/songbooks/${filename}` };
    const library = new SongLibrary(folder); await library.save(pdf, 'creator'); await library.delete(pdf.id);
    await library.cleanup(new Set([pdf.id]));
    expect(await readFile(join(folder, 'songbooks', filename), 'utf8')).toBe('%PDF-1.4');
    await library.cleanup(new Set());
    await expect(readFile(join(folder, 'songbooks', filename))).rejects.toThrow();
  });

});
