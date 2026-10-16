import { HttpError, type Fetcher } from './auth';
export interface GitHubEnv { GITHUB_REPOSITORY: string; GITHUB_TOKEN: string }
export interface Asset { id: number; name: string; size: number; state: string }
export class GitHub {
  constructor(private env: GitHubEnv, private send: Fetcher) {}
  async call(path: string, init: RequestInit = {}, upload = false) {
    const send = this.send;
    const response = await send(`https://${upload ? 'uploads' : 'api'}.github.com/repos/${this.env.GITHUB_REPOSITORY}/${path}`, {
      ...init, redirect: 'manual', headers: {
        'User-Agent': 'music-room-storage', Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${this.env.GITHUB_TOKEN}`, ...init.headers
      }
    });
    return response;
  }
  async release(fileId: string): Promise<number> {
    const tag = `room-files-${fileId.slice(0, 2)}`;
    let response = await this.call(`releases/tags/${tag}`);
    if (response.status === 404) {
      response = await this.call('releases', { method: 'POST', body: JSON.stringify({ tag_name: tag, name: tag, prerelease: true, body: 'Immutable Music Room uploads. Managed by the storage Worker.' }), headers: { 'Content-Type': 'application/json' } });
      if (response.status === 422) response = await this.call(`releases/tags/${tag}`); // concurrent first uploads
    }
    if (!response.ok) throw new HttpError(502, 'Could not open GitHub storage.');
    return (await response.json() as { id: number }).id;
  }
  async metadata(id: string, expectedName: string): Promise<Asset> {
    const response = await this.call(`releases/assets/${id}`);
    if (response.status === 404) throw new HttpError(404, 'File not found.');
    if (!response.ok) throw new HttpError(502, 'GitHub storage unavailable.');
    const asset = await response.json() as Asset;
    if (asset.name !== expectedName || asset.state !== 'uploaded') throw new HttpError(404, 'File not found.');
    return asset;
  }
  async download(id: string, range: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/octet-stream' };
    if (range) headers.Range = range;
    const response = await this.call(`releases/assets/${id}`, { headers });
    if (response.status === 302) {
      const location = new URL(response.headers.get('Location') || 'https://invalid');
      if (location.protocol !== 'https:' || !location.hostname.endsWith('.githubusercontent.com')) throw new HttpError(502, 'Invalid storage redirect.');
      // Signed CDN URL is fetched without the repository secret, including on redirects.
      const send = this.send;
      const result = await send(location.toString(), { redirect: 'manual', headers: range ? { Range: range } : {} });
      if (!result.ok && result.status !== 416) throw new HttpError(502, 'File download failed.');
      return result;
    }
    if (!response.ok && response.status !== 416) throw new HttpError(502, 'File download failed.');
    if (response.headers.get('Content-Type')?.includes('json')) throw new HttpError(502, 'GitHub did not return file bytes.');
    return response;
  }
}
