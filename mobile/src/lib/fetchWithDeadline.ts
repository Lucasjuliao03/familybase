const DEFAULT_DEADLINE_MS = 38_000;

/**
 * Fetch com abort após deadline — equivalente ao PWA, adaptado para React Native.
 */
export function fetchNoStoreWithDeadline(
  input: RequestInfo | URL,
  options: RequestInit & { deadlineMs?: number } = {},
): Promise<Response> {
  const merged = { ...options };
  if (merged.cache == null) merged.cache = 'no-store';

  const parentSignal = merged.signal;
  const deadlineMs = Number.isFinite(merged.deadlineMs) ? merged.deadlineMs! : DEFAULT_DEADLINE_MS;

  const controller = new AbortController();
  let tid: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (tid != null) {
      clearTimeout(tid);
      tid = null;
    }
  };

  if (deadlineMs > 0) {
    tid = setTimeout(() => {
      clearTimer();
      if (!controller.signal.aborted) {
        controller.abort(new DOMException(`fetch_deadline_${deadlineMs}`, 'AbortError'));
      }
    }, deadlineMs);
  }

  if (parentSignal) {
    const onParentAbort = () => {
      clearTimer();
      if (!controller.signal.aborted) {
        controller.abort(parentSignal.reason);
      }
    };
    if (parentSignal.aborted) {
      onParentAbort();
    } else {
      parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }
  }

  return fetch(input, { ...merged, signal: controller.signal }).finally(() => {
    clearTimer();
  });
}

export function fetchNoStore(...args: Parameters<typeof fetchNoStoreWithDeadline>) {
  return fetchNoStoreWithDeadline(...args);
}
