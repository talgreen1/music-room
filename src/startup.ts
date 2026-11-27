import { createErrorDetails, type ErrorContext, type StartupTraceEntry } from './error-details';
import { operationError } from './operation-timeout';

interface StartupOptions {
  room?: string; backend?: string;
  retry: () => void; home: () => void; cancel?: () => void;
}
let active: StartupGuard | undefined;
declare global { interface Window { musicRoomStartupDiagnostics?: StartupTraceEntry[] } }

/** This boundary deliberately has no Firebase, viewer, storage or AbortController dependency. */
export class StartupGuard {
  private entries: StartupTraceEntry[] = [];
  private started = Date.now();
  private stage = 'application startup';
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private listening = false;
  private readonly error = (event: ErrorEvent) => { if (event.error || event.message) { event.preventDefault(); this.fail(event.error || event.message); } };
  private readonly rejection = (event: PromiseRejectionEvent) => { event.preventDefault(); this.fail(event.reason); };
  constructor(private root: HTMLElement, private options: StartupOptions) { this.enter('application startup'); }
  enter(stage: string, timeout = 30000) {
    if (this.disposed) return;
    this.stage = stage; this.record(stage);
    if (!this.listening) { window.addEventListener('error', this.error); window.addEventListener('unhandledrejection', this.rejection); this.listening = true; }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail(operationError('app/startup-timeout', `Startup did not complete during ${stage} within ${timeout / 1000} seconds.`)), timeout);
  }
  private record(stage: string) {
    if (this.entries[this.entries.length - 1]?.stage === stage) return;
    const at = Date.now(); this.entries.push({ stage, at, elapsedMs: Math.max(0, at - this.started) });
    if (this.entries.length > 40) this.entries.shift();
    window.musicRoomStartupDiagnostics = this.entries.map(entry => ({ ...entry }));
  }
  context(stage = this.stage): ErrorContext { return { stage, room: this.options.room, backend: this.options.backend, startup: this.entries.map(entry => ({ ...entry })) }; }
  protect(action: () => void) { if (!this.disposed) { try { action(); } catch (error) { this.fail(error); } } }
  pause() {
    clearTimeout(this.timer);
    window.removeEventListener('error', this.error); window.removeEventListener('unhandledrejection', this.rejection); this.listening = false;
  }
  complete() { if (!this.disposed) { this.record('ready'); this.pause(); } }
  fail(error: unknown) {
    if (this.disposed) return;
    const stage = this.stage; this.record('startup failed'); this.pause();
    // Recovery must not depend on partially constructed room controls or their cleanup succeeding.
    try { this.options.cancel?.(); } catch { this.record('cleanup failed'); }
    this.disposed = true;
    const main = document.createElement('main'); main.className = 'session';
    const panel = document.createElement('section'); panel.className = 'room-recovery startup-recovery'; panel.setAttribute('role', 'alert');
    const title = document.createElement('h1'); title.textContent = 'Could not start Music Room';
    const message = document.createElement('p'); message.textContent = `The app stopped during ${stage}. Copy the error details, then try again.`;
    const actions = document.createElement('div'); actions.className = 'recovery-actions';
    const retry = document.createElement('button'); retry.id = 'retry-room'; retry.className = 'primary'; retry.textContent = 'Try again'; retry.onclick = this.options.retry;
    const home = document.createElement('button'); home.id = 'back-home'; home.className = 'secondary'; home.textContent = 'Back to home'; home.onclick = this.options.home;
    actions.append(retry, home); panel.append(title, message, createErrorDetails(error, this.context(stage)), actions); main.append(panel); this.root.replaceChildren(main);
  }
  dispose() { this.disposed = true; this.pause(); }
}
export function beginStartup(root: HTMLElement, options: StartupOptions) {
  active?.dispose(); active = new StartupGuard(root, options); return active;
}
export function startupStage(stage: string) { active?.enter(stage); }
