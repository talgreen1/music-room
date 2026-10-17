// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { PdfScrollbar } from './scrollbar';
import { createVerticalScrollbarToggle } from './vertical-scrollbar';
afterEach(() => document.body.replaceChildren());
function setup() {
  const host = document.createElement('div'); host.id = 'pdf'; host.scrollTop = 45;
  const scrollbar = new PdfScrollbar(host), control = createVerticalScrollbarToggle(scrollbar);
  document.body.append(host, scrollbar.element, control.toggle);
  return { host, scrollbar, control, bar: scrollbar.element, checkbox: control.toggle.querySelector('input')!, destroy() { control.destroy(); scrollbar.destroy(); } };
}
describe('vertical scrollbar menu preference', () => {
  it('starts hidden for editors, toggles without scrolling, and removes hidden keyboard access', () => {
    const t = setup(); t.control.update(true, true);
    expect(t.checkbox.checked).toBe(false); expect(t.bar.hidden).toBe(true); expect(t.control.toggle.hidden).toBe(false);
    t.checkbox.click(); expect(t.bar.hidden).toBe(false); expect(t.bar.tabIndex).toBe(0);
    t.checkbox.click(); expect(t.bar.hidden).toBe(true); expect(t.bar.tabIndex).toBe(-1);
    expect(t.host.scrollTop).toBe(45); expect(t.bar.getAttribute('aria-orientation')).toBe('vertical');
    t.destroy(); expect(t.bar.isConnected).toBe(false); expect(t.control.toggle.isConnected).toBe(false);
  });
  it('keeps both control and track hidden for Followers and restores a controller preference', () => {
    const t = setup(); t.control.update(false, true);
    expect(t.control.toggle.hidden).toBe(true); expect(t.bar.hidden).toBe(true);
    t.control.update(true, true); t.checkbox.click(); expect(t.bar.hidden).toBe(false);
    t.control.update(false, true); expect(t.control.toggle.hidden).toBe(true); expect(t.bar.hidden).toBe(true); expect(t.bar.tabIndex).toBe(-1);
    t.control.update(true, true); expect(t.checkbox.checked).toBe(true); expect(t.bar.hidden).toBe(false); expect(t.bar.tabIndex).toBe(0);
    t.destroy();
  });
  it('retains visibility across source loading, disables interaction until ready, and resets in a new room', () => {
    const t = setup(); t.control.update(true, true); t.checkbox.click();
    t.control.update(true, false); expect(t.bar.hidden).toBe(false); expect(t.bar.getAttribute('aria-disabled')).toBe('true');
    t.control.update(true, true); expect(t.bar.tabIndex).toBe(0); t.destroy();
    const next = setup(); next.control.update(true, true); expect(next.bar.hidden).toBe(true); expect(next.checkbox.checked).toBe(false); next.destroy();
  });
});
