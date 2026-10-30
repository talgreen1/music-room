import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { validateDiagnosticReport, type DiagnosticReport } from '../src/diagnostic-report';
export class DiagnosticStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory = '.local-data/diagnostics', private now = Date.now) {}
  private async load(code: string): Promise<Record<string, Record<string, DiagnosticReport>>> {
    if (!/^\d{6}$/.test(code)) throw new Error('Invalid room code.');
    try { return JSON.parse(await readFile(join(this.directory, `${code}.json`), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
  }
  private mutate(code: string, action: (reports: Record<string, Record<string, DiagnosticReport>>) => void) {
    const next = this.queue.then(async () => {
      const reports = await this.load(code); action(reports);
      await mkdir(this.directory, { recursive: true }); const file = join(this.directory, `${code}.json`);
      await writeFile(`${file}.tmp`, JSON.stringify(reports)); await rename(`${file}.tmp`, file); return reports;
    });
    this.queue = next.catch(() => {}); return next;
  }
  async save(code: string, uid: string, session: string, value: DiagnosticReport, roomCreatedAt: number) {
    if (!/^[a-f0-9]{32}$/.test(session) || !/^[\w-]{1,128}$/.test(uid)) throw new Error('Invalid diagnostic session.');
    const report = validateDiagnosticReport(value);
    return this.mutate(code, reports => {
      const old = reports[uid]?.[session], now = this.now();
      if (report.roomCreatedAt !== roomCreatedAt || Math.abs(report.updatedAt - now) > 60000 || report.expiresAt <= now ||
        (!old && (report.batch !== 1 || report.createdAt < now - 600000 || report.createdAt > now + 60000)) ||
        (old && (report.roomCreatedAt !== old.roomCreatedAt || report.createdAt !== old.createdAt || report.batch !== old.batch + 1 || report.updatedAt < old.updatedAt + 4000 || report.platform !== old.platform || report.browser !== old.browser))) throw new Error('Invalid diagnostic update.');
      reports[uid] ||= {}; reports[uid][session] = report;
    });
  }
  async read(code: string) {
    return this.mutate(code, reports => { for (const [uid, sessions] of Object.entries(reports)) { for (const [id, report] of Object.entries(sessions)) if (report.expiresAt <= this.now()) delete sessions[id]; if (!Object.keys(sessions).length) delete reports[uid]; } });
  }
  async clear(code: string) { await this.mutate(code, reports => { for (const uid of Object.keys(reports)) delete reports[uid]; }); }
}
