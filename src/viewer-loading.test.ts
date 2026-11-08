// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ tasks: [] as any[] }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ GlobalWorkerOptions: {}, getDocument: () => {
  let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
  const task = { promise: new Promise((yes, no) => { resolve = yes; reject = no; }), destroy: vi.fn(), onProgress: undefined as any, resolve: (value: unknown) => resolve(value), reject: (error: Error) => reject(error) };
  h.tasks.push(task); return task;
} }));
import { SongbookViewer } from './viewer';
let viewer: SongbookViewer;
afterEach(() => { viewer?.destroy(); h.tasks.length = 0; vi.restoreAllMocks(); });
const pdf = () => ({ numPages: 2, getPage: vi.fn(async () => ({ getViewport: () => ({ width: 100, height: 150 }) })) });
it('forwards actual byte progress then reports page preparation separately', async () => {
  viewer = new SongbookViewer(document.createElement('div')); const progress = vi.fn(), work = viewer.load('/book.pdf', progress);
  h.tasks[0].onProgress({ loaded: 200, total: 1000 }); expect(progress).toHaveBeenLastCalledWith({ stage: 'download', loaded: 200, total: 1000 });
  h.tasks[0].resolve(pdf()); await work;
  expect(progress.mock.calls.slice(1).map(([value]) => value)).toEqual([{ stage: 'prepare', loaded: 0, total: 2 }, { stage: 'prepare', loaded: 1, total: 2 }, { stage: 'prepare', loaded: 2, total: 2 }]);
});
it('ignores progress and completion from an obsolete source or destroyed viewer', async () => {
  viewer = new SongbookViewer(document.createElement('div')); const old = vi.fn(), current = vi.fn();
  const first = viewer.load('/old.pdf', old), second = viewer.load('/new.pdf', current);
  h.tasks[0].onProgress({ loaded: 200 }); h.tasks[0].resolve(pdf()); await first; expect(old).not.toHaveBeenCalled();
  expect(h.tasks[0].destroy).toHaveBeenCalledOnce();
  viewer.destroy(); h.tasks[1].onProgress({ loaded: 500 }); h.tasks[1].resolve(pdf()); await second; expect(current).not.toHaveBeenCalled();
});
it('keeps PDF download errors intact for the room error report', async () => {
  viewer = new SongbookViewer(document.createElement('div')); const error = Object.assign(new Error('HTTP 403'), { name: 'UnexpectedResponseException', status: 403 });
  const work = viewer.load('/book.pdf'); const assertion = expect(work).rejects.toBe(error); h.tasks[0].reject(error); await assertion;
});
