// Signed URLs stay in memory only, and are cleared when the authenticated account changes.
const cache = new Map();
let generation = 0;
export function storageAssetPath(value) {
  const path = String(value || '').trim();
  const match = path.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : path.replace(/^\/+/, '');
}
export function familyAssetUrl(value, publicBaseUrl = '') {
  if (!value) return '';
  const path = storageAssetPath(value);
  const entry = cache.get(path);
  if (entry && entry.until > Date.now()) return entry.url;
  if (/^https?:\/\//.test(value) && /\/storage\/v1\/object\/public\//.test(value)) return value;
  if (publicBaseUrl && /^(avatars|family-images)\//.test(path)) return publicBaseUrl.replace(/\/$/,'')+'/storage/v1/object/public/'+path;
  // Catalog/local images and externally supplied HTTPS sources have no private bucket path.
  return /^https?:\/\//.test(path) || !/^(avatars|family-images|uploads)\//.test(path) ? path : '';
}
export function clearFamilyAssets() { generation++; cache.clear(); }
export async function warmFamilyAssets(client, values, force = false) {
  const started = generation;
  const paths = [...new Set(values.filter(Boolean).map(storageAssetPath))].filter(p => /^(avatars|family-images|uploads)\//.test(p) && (force || !cache.get(p) || cache.get(p).until <= Date.now()));
  const buckets = new Map();
  paths.forEach(path => { const [bucket,...parts] = path.split('/'); buckets.set(bucket,[...(buckets.get(bucket) || []),parts.join('/')]); });
  await Promise.all([...buckets].map(async ([bucket,names]) => {
    const { data, error } = await client.storage.from(bucket).createSignedUrls(names,1800);
    if (error || started !== generation) return;
    (data || []).forEach(row => { if (row.signedUrl && !row.error) cache.set(bucket+'/'+row.path,{ url: row.signedUrl, until: Date.now()+25*60000 }); });
  }));
}
export async function warmFamilyProfileAssets(client, familyId, family, force = false) {
  if (!familyId) return;
  const [users,children] = await Promise.all([
    client.from('users').select('avatar_url').eq('family_id',familyId),
    client.from('children').select('avatar_url').eq('family_id',familyId),
  ]);
  await warmFamilyAssets(client,[family?.logo_url,...(users.data || []).map(u=>u.avatar_url),...(children.data || []).map(c=>c.avatar_url)],force);
}
export async function warmResponseAssets(client, data) {
  const values = [];
  const walk = value => {
    if (typeof value === 'string' && /^(avatars|family-images|uploads)\/|\/storage\/v1\/object\//.test(value)) values.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(data); if (values.length) await warmFamilyAssets(client,values);
}
