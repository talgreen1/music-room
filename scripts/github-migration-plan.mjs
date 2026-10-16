/** Pure metadata plan; callers publish once, only after all copied bytes verify. */
export function migrationChanges(snapshot, copies, originalUrl, now, origin, uid) {
  const changes = {};
  for (const copy of copies) {
    const source = snapshot.songs[copy.previousId];
    if (!source || source.deletedAt || !/^[a-f0-9]{32}$/.test(copy.id) || copy.id === copy.previousId || snapshot.songs[copy.id]) throw new Error('Invalid migration mapping.');
    const prefix = `${origin}/files/${uid}/${copy.id}/`;
    if (!copy.urls.length || copy.urls.some((url, index) => !url.startsWith(prefix) || !new RegExp(`^\\d+-${source.pdfUrl ? 'document\\.pdf' : index + '\\.jpg'}$`).test(url.slice(prefix.length))) || copy.urls.length !== (source.pdfUrl ? 1 : source.segments.length)) throw new Error('Invalid copied file URLs.');
    const next = { ...source, id: copy.id, ownerId: uid };
    if (source.pdfUrl) next.pdfUrl = copy.urls[0];
    else next.segments = source.segments.map((segment, index) => ({ ...segment, url: copy.urls[index] }));
    changes[`songs/${copy.id}`] = next;
    changes[`songs/${copy.previousId}/deletedAt`] = now;
    if (snapshot.defaultFile === copy.previousId) changes.defaultFile = copy.id;
  }
  if (originalUrl) {
    if (!snapshot.songbook || !originalUrl.startsWith(`${origin}/files/${uid}/`) || !/^https:\/\/[A-Za-z0-9.-]+\/files\/[A-Za-z0-9_-]+\/[a-f0-9]{32}\/\d+-document\.pdf$/.test(originalUrl)) throw new Error('Invalid original PDF migration.');
    changes.songbook = { ...snapshot.songbook, pdfUrl: originalUrl, pdfVersion: `github-${now}` };
  }
  changes['storageConfig/githubOrigin'] = origin;
  return changes;
}
