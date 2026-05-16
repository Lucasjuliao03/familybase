/** Logs de diagnóstico apenas em desenvolvimento (vite `import.meta.env.DEV`). */
export function famDiag(area, detail) {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console -- diagnóstico explícito
  console.debug(`[Familia:${area}]`, detail);
}

export function famDiagWarn(area, detail) {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.warn(`[Familia:${area}]`, detail);
}
