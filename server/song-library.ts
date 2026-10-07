import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { validateFile, fileUrls, type SharedFile } from '../src/sheets';
import { availableSongs, unusedDeletedSongs, validateSavedSong, type SavedSong } from '../src/song-library';

/** Serialized atomic catalog writes keep imports/deletions durable across restarts. */
export class SongLibrary {
  private records: Record<string, SavedSong> = {};
  private defaultId = 'pdf';
  private queue: Promise<unknown>;
  private ready: Promise<void>;
  constructor(private directory = '.local-data', private now = Date.now) {
    this.ready = readFile(join(directory, 'songs.json'), 'utf8').then(text => {
      const parsed = JSON.parse(text), records = parsed.version === 2 ? parsed.files : parsed;
      this.defaultId = parsed.version === 2 ? parsed.defaultId : 'pdf';
      for (const [id, value] of Object.entries(records)) { const song = validateSavedSong(value as SavedSong); if (song.id !== id) throw new Error('Invalid song catalog ID.'); this.records[id] = song; }
      if (this.defaultId !== 'pdf' && (!this.records[this.defaultId] || this.records[this.defaultId].deletedAt !== undefined)) throw new Error('Invalid default file.');
    }).catch(error => { if (error.code !== 'ENOENT') throw error; });
    this.queue = this.ready;
  }
  private mutate<T>(action: () => Promise<T>): Promise<T> {
    const previousQueue = this.queue;
    const next = this.ready.then(() => previousQueue).then(async () => {
      const previous = structuredClone(this.records);
      const previousDefault = this.defaultId;
      try { const result = await action(); await mkdir(this.directory, { recursive: true }); const file = join(this.directory, 'songs.json'); await writeFile(`${file}.tmp`, JSON.stringify({ version: 2, defaultId: this.defaultId, files: this.records })); await rename(`${file}.tmp`, file); return result; }
      catch (error) { this.records = previous; this.defaultId = previousDefault; throw error; }
    });
    this.queue = next.catch(() => {}); return next;
  }
  async list() { await this.ready; await this.queue; return availableSongs(this.records); }
  async get(id: string) { await this.ready; await this.queue; const song = this.records[id]; return song && song.deletedAt === undefined ? structuredClone(song) : undefined; }
  async defaultFile() { await this.ready; await this.queue; return this.defaultId; }
  setDefault(id: string) { return this.mutate(async () => { if (id !== 'pdf' && (!this.records[id] || this.records[id].deletedAt !== undefined)) throw new Error('Choose an available file.'); this.defaultId = id; }); }
  save(value: SharedFile, ownerId: string, roomCode?: string) {
    return this.mutate(async () => {
      const sheet = validateFile(value); if (this.records[sheet.id]) throw new Error('This song has already been saved.');
      const song = validateSavedSong({ ...sheet, ownerId, roomCode, createdAt: this.now() }); this.records[song.id] = song; return structuredClone(song);
    });
  }
  delete(id: string) {
    return this.mutate(async () => { if (id === this.defaultId) throw new Error('Choose another default before deleting this file.'); const song = this.records[id]; if (song) song.deletedAt = this.now(); });
  }
  deleteMany(ids: string[]) {
    return this.mutate(async () => {
      for (const id of ids) {
        if (id === this.defaultId) continue;
        const song = this.records[id]; if (song && song.deletedAt === undefined) song.deletedAt = this.now();
      }
    });
  }
  cleanup(activeIds: Set<string>) {
    return this.mutate(async () => {
      for (const song of unusedDeletedSongs(this.records, activeIds)) {
        // Keep a tile that another retained song also references.
        const retainedUrls = new Set(Object.values(this.records).filter(other => other.id !== song.id).flatMap(fileUrls));
        for (const url of fileUrls(song)) {
          const match = /^\/api\/(sheets|songbooks)\/([a-f0-9]{32}\.(?:jpg|pdf))$/.exec(url);
          if (match && !retainedUrls.has(url)) await unlink(join(this.directory, match[1], match[2])).catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
        delete this.records[song.id];
      }
    });
  }
}
