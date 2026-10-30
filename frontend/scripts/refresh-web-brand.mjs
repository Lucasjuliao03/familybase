import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Technical image resizing only: the official artwork is reused without redesign.
const require = createRequire(import.meta.url);
const sharp = require(process.env.TUDO_BRAND_SHARP_PATH || 'sharp');
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const source = await fs.readFile(path.join(publicDir,'icons/mobile/logo.png'));
const icons = [
  ['pwa-192x192.png',192,false], ['pwa-512x512.png',512,false],
  ['icons/manifest-icon-192.maskable.png',192,true], ['icons/manifest-icon-512.maskable.png',512,true],
  ['icons/manifest-icon-192.maskable2.png',192,true], ['icons/favicon-196.png',196,false],
  ['icons/apple-icon-180.png',180,false], ['icons/icon-192.png',192,false], ['icons/icon-72.png',72,false],
  ['logo512.png',512,false], ['logo.png',512,false],
];
for (const [filename,size,maskable] of icons) {
  const contentSize = Math.round(size * (maskable ? 0.64 : 0.9));
  const artwork = await sharp(source).resize(contentSize,contentSize,{fit:'contain'}).png().toBuffer();
  await sharp({create:{width:size,height:size,channels:4,background:'#ffffff'}}).composite([{input:artwork,gravity:'center'}]).png().toFile(path.join(publicDir,filename));
}
const favicon = await sharp(source).resize(64,64,{fit:'contain'}).png().toBuffer();
await fs.writeFile(path.join(publicDir,'favicon.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>Tudo de Família</title><image width="64" height="64" href="data:image/png;base64,${favicon.toString('base64')}"/></svg>\n`);
console.log('Official Tudo de Família artwork applied to PWA, favicon, Apple and notification icons.');
