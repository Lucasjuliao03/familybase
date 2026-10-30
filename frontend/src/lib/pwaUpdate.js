/** Atualização manual do SW (vite-plugin-pwa registerType: prompt). */
let applyProdUpdateImpl = async () => {};
let updateAvailable = false;
const updateListeners = new Set();

export function hasProdPwaUpdate() { return updateAvailable; }
export function subscribeToProdPwaUpdate(listener) {
  updateListeners.add(listener);
  return () => updateListeners.delete(listener);
}
export function markProdPwaUpdateAvailable() {
  updateAvailable = true;
  updateListeners.forEach(listener => listener());
}

export function setApplyProdPwaUpdate(fn) {
  applyProdUpdateImpl = typeof fn === 'function' ? fn : async () => {};
}

export async function applyProdPwaUpdate() {
  const result = await applyProdUpdateImpl();
  updateAvailable = false;
  updateListeners.forEach(listener => listener());
  return result;
}
