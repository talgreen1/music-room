import './style.css';
import { beginStartup } from './startup';

// Load the heavyweight application only after its independent recovery UI is available.
const root = document.querySelector<HTMLElement>('#app')!;
const room = /(?:^\?|&)room=(\d{6})(?:&|$)/.exec(location.search)?.[1];
const startup = beginStartup(root, { room,
  retry: () => location.reload(), home: () => { location.href = '/'; } });
startup.enter('application module loading');
void import('./main').then(() => startup.complete(), error => startup.fail(error));
