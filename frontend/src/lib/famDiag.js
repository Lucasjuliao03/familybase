/** Logs de diagnóstico apenas em desenvolvimento (vite `import.meta.env.DEV`). */
export function famDiag(area, detail) {
  if (!import.meta.env.DEV) return;
  console.debug(`[Familia:${area}]`, detail);
}

export function famDiagWarn(area, detail) {
  if (!import.meta.env.DEV) return;
  console.warn(`[Familia:${area}]`, detail);
}
