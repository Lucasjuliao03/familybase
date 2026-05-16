/** Evento único disparado após sessão/perfil atualizados na retomada controlada da PWA. */
export const FAMILIA_CONTROLLED_RESUME = 'familia-controlled-resume';

/** @deprecated Manter apenas compat; preferir escutar FAMILIA_CONTROLLED_RESUME ou useAutoRefresh */
export const FAMILIA_APP_VISIBLE = 'familia-app-visible';

export function dispatchFamiliaControlledResume() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(FAMILIA_CONTROLLED_RESUME));
  } catch {
    /* noop */
  }
}

export function dispatchFamiliaAppVisible() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(FAMILIA_APP_VISIBLE));
  } catch {
    /* noop */
  }
}
