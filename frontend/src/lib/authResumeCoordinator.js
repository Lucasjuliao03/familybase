/** @typedef {() => void | Promise<void>} AuthResumeExecutor */

/** Executa reconnect + sessão Supabase antes de chamadas REST (`api.js`, `useAutoRefresh`). */
/** @type {AuthResumeExecutor} */
let executor = async () => {};

/** @type {Promise<void>|null} */
let inflight = null;

export function registerAuthResumeExecutor(fn) {
  executor = typeof fn === 'function' ? fn : async () => {};
}

/**
 * Garante uma execução única em voo; chamadas em paralelo parteilham a mesma promessa.
 */
export function ensureAuthResumeBeforeNetwork() {
  if (inflight) return inflight;

  inflight = Promise.resolve()
    .then(() => executor())
    .catch((e) => {
      console.warn('[authResumeCoordinator] executor falhou:', e);
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
