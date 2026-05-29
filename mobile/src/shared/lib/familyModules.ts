export function moduleAllowed(modules: Record<string, any> | null | undefined, moduleKey: string): boolean {
  if (!modules || typeof modules !== 'object') return false;
  return modules[moduleKey] === true;
}

export function anyModuleAllowed(modules: Record<string, any> | null | undefined, keys: string[]): boolean {
  if (!keys?.length) return true;
  return keys.some((k) => moduleAllowed(modules, k));
}
