export function moduleAllowed(modules, moduleKey) {
  if (!modules || typeof modules !== 'object') return false;
  return modules[moduleKey] === true;
}

export function anyModuleAllowed(modules, keys) {
  if (!keys?.length) return true;
  return keys.some((k) => moduleAllowed(modules, k));
}
