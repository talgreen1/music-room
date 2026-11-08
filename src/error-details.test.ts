// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ copy: vi.fn() }));
vi.mock('./clipboard', () => ({ copyText: h.copy }));
import { createErrorDetails, formatErrorDetails } from './error-details';
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
it('preserves useful failure details and context while redacting secrets and URL queries', () => {
  const cause = Object.assign(new Error('upstream response'), { status: 403 });
  const error = Object.assign(new Error('Fetch https://user:pass@example.org/a.pdf?token=private#secret failed; password="two secret words"; Authorization: Bearer jwt-value; {"token":"json-secret"}', { cause }), { code: 'permission-denied' });
  const report = formatErrorDetails(error, { stage: 'document loading', room: '123456', backend: 'Firebase' });
  for (const text of ['permission-denied', 'HTTP status: 403', 'Room: 123456', 'Stage: document loading', 'Stack:', 'Caused by:', 'Browser:', 'Network:']) expect(report).toContain(text);
  for (const secret of ['user:pass', 'token=private', '#secret', 'two secret words', 'jwt-value', 'json-secret']) expect(report).not.toContain(secret);
  expect(report).toContain('https://example.org/a.pdf?[redacted]');
});
it('shows the same safely rendered report that Copy error copies, with a usable failure fallback', async () => {
  h.copy.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const element = createErrorDetails('<script>bad()</script>', { stage: 'room subscription' }); document.body.append(element);
  expect(element.querySelector('script')).toBeNull(); expect(element.querySelector('details')!.open).toBe(true);
  const report = element.querySelector('pre')!.textContent;
  element.querySelector('button')!.click(); await Promise.resolve();
  expect(h.copy).toHaveBeenLastCalledWith(report, element, 'Error details to copy'); expect(element.textContent).toContain('Error copied.');
  element.querySelector('button')!.click(); await Promise.resolve(); expect(element.textContent).toContain('copy them manually');
});
it('bounds very long exceptions and cyclic causes', () => {
  const error = new Error('x'.repeat(20000)); (error as any).cause = error;
  expect(formatErrorDetails(error, { stage: 'test' })).toHaveLength(12000);
});
