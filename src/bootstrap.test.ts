// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
vi.mock('./main', () => { throw new Error('Application module could not be evaluated'); });
it('shows a phone-visible report if the application module fails to load or evaluate', async () => {
  document.body.innerHTML = '<div id="app"></div>'; history.replaceState({}, '', '/?room=761483');
  await import('./bootstrap'); for (let n = 0; n < 40; n++) await Promise.resolve();
  expect(document.querySelector('.startup-recovery')!.textContent).toContain('Application module could not be evaluated');
  expect(document.querySelector('pre')!.textContent).toContain('Stage: application module loading');
  expect(document.querySelector('pre')!.textContent).toContain('Room: 761483');
  expect(document.querySelector('.copy-error')).not.toBeNull(); expect(document.querySelector('#retry-room')).not.toBeNull();
  document.body.replaceChildren();
});
