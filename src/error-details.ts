import { copyText } from './clipboard';
export interface ErrorContext { stage: string; room?: string; backend?: string; page?: number }
export function redactErrorText(value: string) {
  return value.replace(/https?:\/\/[^\s<>"']+/gi, raw => {
    try { const url = new URL(raw); return `${url.origin}${url.pathname}${url.search || url.hash ? '?[redacted]' : ''}`; } catch { return '[URL redacted]'; }
  }).replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\b(password|token|access_token|refresh_token|idToken|refreshToken|apiKey|api_key|client_secret|authorization)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, '$1=[redacted]');
}
export function formatErrorDetails(error: unknown, context: ErrorContext) {
  const lines = ['Music Room error', `Time: ${new Date().toISOString()}`, `Stage: ${context.stage}`];
  if (context.room) lines.push(`Room: ${context.room}`);
  if (context.backend) lines.push(`Backend: ${context.backend}`);
  if (context.page) lines.push(`Page: ${context.page}`);
  lines.push(`Network: ${navigator.onLine ? 'online' : 'offline'}`, `Browser: ${navigator.userAgent}`);
  const seen = new Set<unknown>(); let current = error;
  for (let depth = 0; current != null && depth < 3 && !seen.has(current); depth++) {
    seen.add(current); const value = current as { name?: unknown; message?: unknown; code?: unknown; status?: unknown; stack?: unknown; cause?: unknown };
    lines.push(depth ? 'Caused by:' : 'Error:');
    if (typeof current === 'string') { lines.push(current); break; }
    if (typeof value.name === 'string') lines.push(`Name: ${value.name}`);
    if (typeof value.message === 'string') lines.push(`Message: ${value.message}`);
    else lines.push('An unexpected error occurred.');
    if (typeof value.code === 'string' || typeof value.code === 'number') lines.push(`Code: ${value.code}`);
    if (typeof value.status === 'number') lines.push(`HTTP status: ${value.status}`);
    if (typeof value.stack === 'string') lines.push(`Stack:\n${value.stack}`);
    current = value.cause;
  }
  return redactErrorText(lines.join('\n')).slice(0, 12000);
}
export function createErrorDetails(error: unknown, context: ErrorContext) {
  const element = document.createElement('section'); element.className = 'error-details';
  const details = document.createElement('details'); details.open = true;
  const summary = document.createElement('summary'); summary.textContent = 'Error details';
  const report = formatErrorDetails(error, context), text = document.createElement('pre'); text.textContent = report; text.tabIndex = 0;
  const copy = document.createElement('button'); copy.className = 'secondary copy-error'; copy.textContent = 'Copy error';
  const status = document.createElement('span'); status.setAttribute('role', 'status');
  copy.onclick = async () => {
    const copied = await copyText(report, element, 'Error details to copy');
    if (element.isConnected) status.textContent = copied ? 'Error copied.' : 'Copy failed. Select the error details above and copy them manually.';
  };
  details.append(summary, text); element.append(details, copy, status); return element;
}
