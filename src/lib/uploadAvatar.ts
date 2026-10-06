import { supabase } from './supabase';

/** Decodifica base64 para Uint8Array sem depender de atob (Hermes-safe). */
function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const bufferLength = Math.floor((len * 3) / 4);
  const bytes = new Uint8Array(bufferLength);

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = lookup[clean.charCodeAt(i)];
    const e2 = lookup[clean.charCodeAt(i + 1)];
    const e3 = lookup[clean.charCodeAt(i + 2)];
    const e4 = lookup[clean.charCodeAt(i + 3)];
    if (p < bufferLength) bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < bufferLength) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < bufferLength) bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return bytes;
}

/**
 * Envia uma imagem (em base64) para o bucket público `avatars` e devolve o URL
 * público. Best-effort: lança erro se o upload falhar, mas o chamador pode
 * ignorar (avatar é opcional no cadastro).
 */
export async function uploadAvatarBase64(
  userId: string,
  base64: string,
  ext: string = 'jpg',
): Promise<string> {
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `signups/${userId}-${Date.now()}.${ext}`;
  const bytes = base64ToBytes(base64);

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}
