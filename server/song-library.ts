import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { validateSheet, type ImageSheet } from '../src/sheets';
import { availableSongs, unusedDeletedSongs, validateSavedSong, type SavedSong } from '../src/song-library';

/** Serialized atomic catalog writes keep imports/deletions durable across restarts. */
export class SongLibrary {
  private records: Record<string, SavedSong> = {};
  private queue: Promise<unknown>;
  private ready: Promise<void>;
  constructor(private directory = '.local-data', private now = Date.now) {
    this.ready = readFile(join(directory, 'songs.json'), 'utf8').then(text => {
      const records = JSON.parse(text); for (const [id, value] of Object.entries(records)) { const song = validateSavedSong(value as SavedSong); if (song.id !== id) throw new Error('Invalid song catalog ID.'); this.records[id] = song; }
    }).catch(error => { if (error.code !== 'ENOENT') throw error; });
    this.queue = this.ready;
  }
  private mutate<T>(action: () => Promise<T>): Promise<T> {
    const previousQueue = this.queue;
    const next = this.ready.then(() => previousQueue).then(async () => {
      const previous = structuredClone(this.records);
      try { const result = await action(); await mkdir(this.directory, { recursive: true }); const file = join(this.directory, 'songs.json'); await writeFile(`${file}.tmp`, JSON.stringify(this.records)); await rename(`${file}.tmp`, file); return result; }
      catch (error) { this.records = previous; throw error; }
    });
    this.queue = next.catch(() => {}); return next;
  }
  async list() { await this.ready; await this.queue; return availableSongs(this.records); }
  async get(id: string) { await this.ready; await this.queue; const song = this.records[id]; return song && song.deletedAt === undefined ? structuredClone(song) : undefined; }
  save(value: ImageSheet, ownerId: string, roomCode?: string) {
    return this.mutate(async () => {
      const sheet = validateSheet(value); if (this.records[sheet.id]) throw new Error('This song has already been saved.');
      const song = validateSavedSong({ ...sheet, ownerId, roomCode, createdAt: this.now() }); this.records[song.id] = song; return structuredClone(song);
    });
  }
  delete(id: string) {
    return this.mutate(async () => { const song = this.records[id]; if (song) song.deletedAt = this.now(); });
  }
  cleanup(activeIds: Set<string>) {
    return this.mutate(async () => {
      for (const song of unusedDeletedSongs(this.records, activeIds)) {
        // Keep a tile that another retained song also references.
        const retainedUrls = new Set(Object.values(this.records).filter(other => other.id !== song.id).flatMap(other => other.segments.map(segment => segment.url)));
        for (const segment of song.segments) {
          const file = /^\/api\/sheets\/([a-f0-9]{32}\.jpg)$/.exec(segment.url)?.[1];
          if (file && !retainedUrls.has(segment.url)) await unlink(join(this.directory, 'sheets', file)).catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
        delete this.records[song.id];
      }
    });
  }
}
