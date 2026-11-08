export function operationError(code: string, message: string) { return Object.assign(new Error(message), { code }); }
/** Bound waiting; an uncancellable SDK promise may settle later but cannot resume this operation. */
export function withDeadline<T>(work: Promise<T>, milliseconds: number, code: string, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const abort = () => finish(() => reject(new DOMException('Operation cancelled.', 'AbortError')));
    const finish = (complete: () => void) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); complete(); };
    timer = setTimeout(() => finish(() => reject(operationError(code, `No response within ${milliseconds / 1000} seconds. Check your connection and try again.`))), milliseconds);
    work.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  });
}
