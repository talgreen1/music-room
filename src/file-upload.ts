import type { User } from 'firebase/auth';
import { validatePdfUpload } from './songbook';
import { uploadGitHubFile } from './github-storage';

/** Cloud imports use immutable GitHub assets; development can use the local API. */
export async function uploadLibraryPdf(file: File, id: string, user: User | null, localPath?: string, token?: string, roomCode?: string): Promise<string> {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid file ID.');
  validatePdfUpload(file.size, new Uint8Array(await file.slice(0, 1024).arrayBuffer()));
  if (localPath) {
    const response = await fetch(localPath, { method: 'POST', headers: { 'Content-Type': 'application/pdf', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: file });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'PDF upload failed.');
    return result.pdfUrl;
  }
  if (!user) throw new Error('Sign in before uploading.');
  return uploadGitHubFile(file, id, 'document.pdf', user, roomCode);
}
