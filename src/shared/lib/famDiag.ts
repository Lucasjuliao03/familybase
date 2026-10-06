export function famDiag(area: string, detail: any) {
  if (!__DEV__) return;
  console.log(`[Familia:${area}]`, detail);
}

export function famDiagWarn(area: string, detail: any) {
  if (!__DEV__) return;
  console.warn(`[Familia:${area}]`, detail);
}
