import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Bundled build tooling, never a dependency of the app or the mobile.
const sharp = require(process.env.WEB_SHARP_PATH || 'C:/Users/juliao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const destination = path.resolve('public/brand');
await fs.mkdir(destination, { recursive: true });
await sharp('public/icons/mobile/logo.png').resize(240, 240, { fit: 'inside' }).webp({ quality: 88 }).toFile(path.join(destination, 'logo.webp'));
for (const id of ['lili', 'tobe', 'pipo', 'luca']) {
  await sharp(`../mobile/assets/mascots/${id}.png`).resize(600, 600, { fit: 'inside' }).webp({ quality: 85 }).toFile(path.join(destination, `${id}.webp`));
}
console.log('Official brand assets optimized without changing mobile originals.');
