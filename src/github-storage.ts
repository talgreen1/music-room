import type { User } from 'firebase/auth';

export function validateGitHubStorageOrigin(input: string | undefined): string {
  const value = input?.replace(/\/$/, '');
  if (!value) throw new Error('Configure VITE_GITHUB_STORAGE_URL before using cloud file storage.');
  if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(value)) throw new Error('Configure an HTTPS GitHub storage origin without a path.');
  return value;
}
export function storageOrigin(): string { return validateGitHubStorageOrigin(import.meta.env.VITE_GITHUB_STORAGE_URL); }
export async function uploadGitHubFile(blob: Blob, id: string, filename: string, user: User, roomCode?: string): Promise<string> {
  const origin = storageOrigin();
  if (!/^[a-f0-9]{32}$/.test(id) || !/^(document\.pdf|(?:[0-9]|[1-3][0-9])\.jpg)$/.test(filename)) throw new Error('Invalid file storage configuration.');
  const prefix = `${origin}/files/${user.uid}/${id}/`;
  const response = await fetch(`${prefix}${filename}`, {
    method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': filename === 'document.pdf' ? 'application/pdf' : 'image/jpeg',
      'X-File-Size': String(blob.size), ...(roomCode ? { 'X-Room-Code': roomCode } : {}) }, body: blob
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'File upload failed.');
  if (typeof result.url !== 'string' || !result.url.startsWith(prefix) || !/^\d+-(document\.pdf|(?:[0-9]|[1-3][0-9])\.jpg)$/.test(result.url.slice(prefix.length)) || !result.url.endsWith(`-${filename}`)) throw new Error('Storage returned an invalid file URL.');
  return result.url;
}
export async function deleteGitHubFiles(urls: string[], ownerId: string, id: string, user: User): Promise<boolean> {
  const origin = storageOrigin();
  if (!urls.every(url => url.startsWith(`${origin}/files/${ownerId}/${id}/`) && /^\d+-(document\.pdf|(?:[0-9]|[1-3][0-9])\.jpg)$/.test(url.slice(`${origin}/files/${ownerId}/${id}/`.length)))) return false;
  for (const url of urls) {
    const response = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    if (!response.ok) throw new Error('File hidden. GitHub cleanup failed; refresh Settings to retry.');
  }
  return true;
}
