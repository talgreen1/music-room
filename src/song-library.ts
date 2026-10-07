import { validateFile, type SharedFile } from './sheets';
import type { Room } from './model';
export type SavedSong = SharedFile & { ownerId: string; roomCode?: string; createdAt: number; deletedAt?: number };
/** Origin is the upload room, not every room that later selects the file. */
export function roomUploads(songs: SavedSong[], rooms: Record<string, Room>): SavedSong[] {
  return songs.filter(song => {
    const room = song.roomCode ? rooms[song.roomCode] : undefined;
    return room && song.ownerId === room.masterId && song.createdAt >= room.createdAt && song.createdAt <= room.expiresAt && song.deletedAt === undefined;
  });
}
export function validateSavedSong(value: SavedSong): SavedSong {
  const sheet = validateFile(value);
  if (typeof value.ownerId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.ownerId) || (value.roomCode !== undefined && !/^\d{6}$/.test(value.roomCode)) || !Number.isFinite(value.createdAt) || value.createdAt < 0 || (value.deletedAt !== undefined && (!Number.isFinite(value.deletedAt) || value.deletedAt < 0))) throw new Error('Invalid saved song.');
  return { ...sheet, ownerId: value.ownerId, ...(value.roomCode === undefined ? {} : { roomCode: value.roomCode }), createdAt: value.createdAt, ...(value.deletedAt === undefined ? {} : { deletedAt: value.deletedAt }) };
}
export function availableSongs(records: Record<string, SavedSong>): SavedSong[] {
  return Object.values(records).map(validateSavedSong).filter(song => song.deletedAt === undefined).sort((a, b) => a.title.localeCompare(b.title) || b.createdAt - a.createdAt);
}
export function unusedDeletedSongs(records: Record<string, SavedSong>, activeIds: Set<string>): SavedSong[] {
  return Object.values(records).map(validateSavedSong).filter(song => song.deletedAt !== undefined && !activeIds.has(song.id));
}
