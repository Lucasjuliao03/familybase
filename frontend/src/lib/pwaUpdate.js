/** Atualização manual do SW (vite-plugin-pwa registerType: prompt). */
let applyProdUpdateImpl = async () => {};

export function setApplyProdPwaUpdate(fn) {
  applyProdUpdateImpl = typeof fn === 'function' ? fn : async () => {};
}

export async function applyProdPwaUpdate() {
  return applyProdUpdateImpl();
}
