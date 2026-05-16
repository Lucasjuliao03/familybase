import { useEffect, useRef } from 'react';
import { formatLocalYMD } from '../lib/familyCalendarRange';

/** Milissegundos até a próxima ocorrência local de (00, minute, second). */
export function msUntilNextLocalPivot(minute, second) {
  const now = Date.now();
  const d = new Date(now);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minute, second, 0);
  if (target.getTime() <= now) target.setDate(target.getDate() + 1);
  return Math.max(5_000, target.getTime() - now);
}

/**
 * Renova dados ao virar o dia civil:
 * - Às 00:01:05 (configurável) chama sempre o callback (materializa tarefas diárias no servidor).
 * - Em poll, se a data YYYY-MM-DD mudar (ex.: sleep do portátil), volta a chamar.
 */
export default function useDailyCalendarRefresh(onCalendarRefresh, opts = {}) {
  const { enabled = true, pollMs = 45_000, pivotMinute = 1, pivotSecond = 5 } = opts;

  const cbRef = useRef(onCalendarRefresh);
  const lastSeenYMDRef = useRef('');

  useEffect(() => {
    cbRef.current = onCalendarRefresh;
  }, [onCalendarRefresh]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const runPoll = () => {
      const y = formatLocalYMD(new Date());
      if (!y) return;
      if (!lastSeenYMDRef.current) {
        lastSeenYMDRef.current = y;
        return;
      }
      if (y === lastSeenYMDRef.current) return;
      lastSeenYMDRef.current = y;
      try {
        cbRef.current?.();
      } catch {
        /* noop */
      }
    };

    lastSeenYMDRef.current = '';

    const pollId = window.setInterval(runPoll, pollMs);

    let timeoutId = null;

    function schedulePivot() {
      if (timeoutId) window.clearTimeout(timeoutId);
      const delay = msUntilNextLocalPivot(pivotMinute, pivotSecond);
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        const y = formatLocalYMD(new Date());
        if (y) lastSeenYMDRef.current = y;
        try {
          cbRef.current?.();
        } catch {
          /* noop */
        }
        schedulePivot();
      }, delay);
    }

    schedulePivot();

    const onVis = () => {
      if (document.visibilityState === 'visible') runPoll();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.clearInterval(pollId);
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, pollMs, pivotMinute, pivotSecond]);
}
