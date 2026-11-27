export type RoomRecoveryPhase = 'authentication refresh' | 'room subscription retry';
interface Options<T> {
  subscribe: (value: (value: T) => void, error: (error: unknown) => void) => () => void;
  refresh: (signal: AbortSignal) => Promise<void>;
  value: (value: T) => void; error: (error: unknown) => void; recovery?: (phase: RoomRecoveryPhase) => void;
}
function permissionDenied(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string') return /^(?:database\/)?permission-denied$/i.test(code.replace(/_/g, '-'));
  return /permission[_ -]denied/i.test(error instanceof Error ? error.message : String(error));
}
/** Retry only an initial denied listener, once, without changing identity or access rules. */
export function subscribeRoomWithRecovery<T>(options: Options<T>) {
  let live = true, hasValue = false, retried = false, epoch = 0;
  let unsubscribe: (() => void) | undefined, delay: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const stop = () => { live = false; epoch++; controller.abort(); clearTimeout(delay); unsubscribe?.(); unsubscribe = undefined; };
  const fail = (error: unknown) => { if (live) { stop(); options.error(error); } };
  const listen = () => {
    if (!live) return;
    const attempt = ++epoch;
    const off = options.subscribe(value => {
      if (live && attempt === epoch) { hasValue = true; options.value(value); }
    }, error => {
      if (!live || attempt !== epoch) return;
      if (hasValue || retried || !permissionDenied(error)) { fail(error); return; }
      retried = true; epoch++; unsubscribe?.(); unsubscribe = undefined;
      void (async () => {
        try {
          options.recovery?.('authentication refresh');
          await options.refresh(controller.signal);
          if (!live) return;
          // Let the refreshed credential propagate to the existing database connection.
          delay = setTimeout(() => {
            if (!live) return;
            try { options.recovery?.('room subscription retry'); listen(); } catch (error) { fail(error); }
          }, 250);
        } catch (cause) {
          if (live) fail(Object.assign(new Error('Room access recovery failed after an initial PERMISSION_DENIED.', { cause }), { code: 'room/auth-recovery-failed' }));
        }
      })();
    });
    if (!live || attempt !== epoch) off(); else unsubscribe = off;
  };
  try { listen(); } catch (error) { fail(error); }
  return stop;
}
