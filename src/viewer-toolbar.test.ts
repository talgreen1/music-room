import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewerToolbar } from './viewer-toolbar';

afterEach(() => vi.unstubAllGlobals());
function setup() {
  const nodes = Object.fromEntries(['.page-navigation', '#first-page', '#previous', '#next', '#zoom-out', '#zoom-in', '#zoom'].map(key => [key, { disabled: false, hidden: false, textContent: '', onclick: () => {} }]));
  const root = { className: '', innerHTML: '', querySelector: (selector: string) => nodes[selector] };
  vi.stubGlobal('document', { createElement: () => root });
  let position: { page: number; zoom: number } | undefined = { page: 2, zoom: 1 };
  let interactive = true, navigate = true;
  const jump = vi.fn((page: number) => { position!.page = page; });
  const zoom = vi.fn((value: number) => { position!.zoom = value; });
  const toolbar = createViewerToolbar({ position: () => position, count: () => 5, canInteract: () => interactive, canNavigate: () => navigate, jump, zoom });
  return { root, nodes, toolbar, jump, zoom, setPosition: (value: typeof position) => { position = value; }, lock: () => { interactive = false; }, unlock: () => { interactive = true; }, hideNavigation: () => { navigate = false; } };
}
describe('compact viewer toolbar', () => {
  it('renders the first-page button before previous/next and compact zoom without page counts', () => {
    const { root, toolbar } = setup(); toolbar.refresh();
    expect(root.innerHTML.match(/<button /g)).toHaveLength(5);
    expect(root.innerHTML).toContain('aria-label="Jump to page 1"');
    expect(root.innerHTML.indexOf('id="first-page"')).toBeLessThan(root.innerHTML.indexOf('id="previous"'));
    expect(root.innerHTML).toContain('aria-label="Previous page"'); expect(root.innerHTML).toContain('aria-label="Next page"');
    expect(root.innerHTML).not.toMatch(/<input|page-form|Page number|id="count"/);
  });
  it('returns to page one without changing zoom, including from within page one', () => {
    const t = setup(); t.setPosition({ page: 5, zoom: 2 });
    t.nodes['#first-page'].onclick(); expect(t.jump).toHaveBeenCalledWith(1); expect(t.zoom).not.toHaveBeenCalled();
    t.toolbar.refresh(); expect(t.nodes['#first-page'].disabled).toBe(false);
    t.nodes['#first-page'].onclick(); expect(t.jump).toHaveBeenCalledTimes(2);
    t.lock(); t.nodes['#first-page'].onclick(); expect(t.jump).toHaveBeenCalledTimes(2);
    t.unlock(); t.hideNavigation(); t.nodes['#first-page'].onclick(); expect(t.jump).toHaveBeenCalledTimes(2);
    t.setPosition(undefined); t.toolbar.refresh(); expect(t.nodes['#first-page'].disabled).toBe(true);
  });
  it('navigates from the latest viewer page, including repeated presses and page boundaries', () => {
    const t = setup(); t.nodes['#next'].onclick(); t.nodes['#next'].onclick();
    expect(t.jump.mock.calls).toEqual([[3], [4]]);
    t.setPosition({ page: 5, zoom: 1 }); t.toolbar.refresh(); expect(t.nodes['#next'].disabled).toBe(true);
    t.nodes['#next'].onclick(); expect(t.jump).toHaveBeenCalledTimes(2);
    t.nodes['#previous'].onclick(); expect(t.jump).toHaveBeenLastCalledWith(4);
    t.setPosition({ page: 1, zoom: 1 }); t.toolbar.refresh(); expect(t.nodes['#previous'].disabled).toBe(true);
  });
  it('zooms in 10 percentage point steps, clamps at existing limits and reflects pinch/remote updates', () => {
    const t = setup(); t.nodes['#zoom-in'].onclick(); expect(t.zoom).toHaveBeenLastCalledWith(1.1);
    t.nodes['#zoom-out'].onclick(); expect(t.zoom).toHaveBeenLastCalledWith(1);
    t.setPosition({ page: 2, zoom: .8 }); t.nodes['#zoom-out'].onclick(); expect(t.zoom).toHaveBeenLastCalledWith(.75);
    t.toolbar.refresh(); expect(t.nodes['#zoom-out'].disabled).toBe(true); expect(t.nodes['#zoom'].textContent).toBe('75%');
    t.setPosition({ page: 2, zoom: 4 }); t.toolbar.refresh(); expect(t.nodes['#zoom-in'].disabled).toBe(true);
    t.setPosition({ page: 2, zoom: 1.37 }); t.toolbar.refresh(); expect(t.nodes['#zoom'].textContent).toBe('137%');
  });
  it('blocks synced followers and unloaded viewers, but permits private follower zoom after sync is unchecked', () => {
    const t = setup(); t.hideNavigation(); t.lock(); t.toolbar.refresh();
    expect(t.nodes['.page-navigation'].hidden).toBe(true); expect(t.nodes['#zoom-in'].disabled).toBe(true);
    t.nodes['#next'].onclick(); t.nodes['#zoom-in'].onclick(); expect(t.jump).not.toHaveBeenCalled(); expect(t.zoom).not.toHaveBeenCalled();
    t.unlock(); t.toolbar.refresh(); t.nodes['#zoom-in'].onclick(); expect(t.zoom).toHaveBeenCalledWith(1.1);
    t.nodes['#next'].onclick(); expect(t.jump).not.toHaveBeenCalled();
    t.setPosition(undefined); t.toolbar.refresh(); t.nodes['#zoom-in'].onclick(); expect(t.zoom).toHaveBeenCalledTimes(1);
    expect(t.nodes['#zoom-out'].disabled).toBe(true);
  });
});
