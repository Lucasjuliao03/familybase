/**
 * Utilitário para rastrear Dispositivos Únicos
 */

export function getDeviceType() {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

export function getDeviceId() {
  const STORAGE_KEY = 'familybase_device_id';
  let deviceId = localStorage.getItem(STORAGE_KEY);
  
  if (!deviceId) {
    // Gera um ID simples e único para a vida útil deste navegador/dispositivo
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  
  return deviceId;
}

export function getDeviceName() {
  const type = getDeviceType();
  const id = getDeviceId().substring(4, 8).toUpperCase();
  
  if (type === 'mobile') return `Celular (${id})`;
  if (type === 'tablet') return `Tablet (${id})`;
  return `Computador (${id})`;
}
