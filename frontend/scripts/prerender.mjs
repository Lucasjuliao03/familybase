import { createServer } from 'vite';
import fs from 'node:fs/promises';
import React from 'react';
import { renderToString } from 'react-dom/server';
import react from '@vitejs/plugin-react';
// The SEO renderer must not invalidate the running dev server's dependency cache.
const vite = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-prerender', plugins: [react()], ssr: { external: ['react', 'react-dom', 'react/jsx-runtime'] }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: Landing } = await vite.ssrLoadModule('/src/pages/public/LandingPage.jsx');
  let html = await fs.readFile('dist/index.html', 'utf8');
  if (process.env.VITE_PUBLIC_SITE_URL) {
    const site = new URL(process.env.VITE_PUBLIC_SITE_URL);
    if (site.protocol !== 'https:' || site.username || site.password) throw new Error('VITE_PUBLIC_SITE_URL deve ser a origem HTTPS pública.');
    html = html.replace('</head>', `<link rel="canonical" href="${site.origin}/" /><meta property="og:url" content="${site.origin}/" /></head>`);
    await fs.writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site.origin}/</loc></url></urlset>`);
  }
  const rendered = renderToString(React.createElement(Landing));
  await fs.writeFile('dist/index.html', html.replace('<div id="root"></div>', `<div id="root">${rendered}</div>`));
  console.log('Public landing pre-rendered for crawlers and fast first paint.');
} finally { await vite.close(); }
