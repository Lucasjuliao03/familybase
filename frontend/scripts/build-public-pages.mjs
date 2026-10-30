import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_INFORMATION_PAGES, PUBLIC_INFORMATION_UPDATED, SUPPORT_EMAIL } from '../src/lib/publicInformation.js';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const href = value => {
  if (!/^(?:\/(?!\/)|https:\/\/|mailto:)/.test(value)) throw Error('Link público inválido: ' + value);
  return escape(value);
};
function link(item) {
  const external = item.href.startsWith('https://');
  return '<a href="' + href(item.href) + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + escape(item.label) + (external ? '<span class="sr-only"> (abre em nova aba)</span>' : '') + '</a>';
}
export function renderPublicInformationPage(page, origin = 'https://tudodefamilia.com.br') {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password) throw Error('A origem pública precisa usar HTTPS.');
  if (!/^[a-z-]+\.html$/.test(page.filename)) throw Error('Nome de página inválido.');
  const navigation = PUBLIC_INFORMATION_PAGES.map(item => '<a href="/' + item.filename + '"' + (item.key === page.key ? ' aria-current="page"' : '') + '>' + escape(item.title) + '</a>').join('\n');
  const sections = page.sections.map((section, index) => '<section aria-labelledby="section-' + index + '"><h2 id="section-' + index + '">' + escape(section.title) + '</h2>'
    + (section.paragraphs || []).map(text => '<p>' + escape(text) + '</p>').join('')
    + (section.bullets ? '<ul>' + section.bullets.map(text => '<li>' + escape(text) + '</li>').join('') + '</ul>' : '')
    + (section.steps ? '<ol class="info-steps">' + section.steps.map(text => '<li>' + escape(text) + '</li>').join('') + '</ol>' : '')
    + (section.links ? '<div class="info-links">' + section.links.map(link).join('') + '</div>' : '') + '</section>').join('\n');
  return '<!doctype html>\n<!-- Gerado por scripts/build-public-pages.mjs a partir de src/lib/publicInformation.js. -->\n'
    + '<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + escape(page.title) + ' — Tudo de Família</title><meta name="description" content="' + escape(page.description) + '">'
    + '<link rel="canonical" href="' + base.origin + '/' + page.filename + '"><link rel="icon" href="/brand/logo.webp"><link rel="stylesheet" href="/information.css"></head><body class="information-site">'
    + '<a class="info-skip" href="#conteudo">Pular para o conteúdo</a>'
    + '<header class="info-header info-wrap"><a class="info-brand" href="/" aria-label="Tudo de Família — início"><img src="/brand/logo.webp" width="48" height="48" alt=""><span>Tudo de Família<small>Mais tempo para estar junto.</small></span></a>'
    + '<nav aria-label="Navegação principal"><a href="/support.html">Suporte</a><a class="info-login" href="/login">Entrar na conta <span aria-hidden="true">↗</span></a></nav></header>'
    + '<main class="info-wrap" id="conteudo"><a class="info-back" href="/">← Voltar ao início</a><div class="info-layout">'
    + '<aside class="info-sidebar"><nav aria-label="Informações e ajuda"><p>INFORMAÇÕES E AJUDA</p>' + navigation + '</nav></aside>'
    + '<article class="info-document"><header class="info-document-header"><p class="info-eyebrow">' + escape(page.kicker) + '</p><h1>' + escape(page.title) + '</h1><p class="info-lead">' + escape(page.lead) + '</p><p class="info-updated">Atualizado em ' + escape(PUBLIC_INFORMATION_UPDATED) + '</p></header>'
    + sections
    + '<div class="info-contact"><div><strong>Precisa de ajuda?</strong><p>Fale com a equipe do Tudo de Família.</p></div><a href="mailto:' + SUPPORT_EMAIL + '">' + SUPPORT_EMAIL + '</a></div></article></div></main>'
    + '<footer class="info-footer info-wrap"><a class="info-footer-brand" href="/">Tudo de Família</a><nav aria-label="Links do rodapé">' + navigation + '</nav><small>© 2026 Tudo de Família.</small></footer></body></html>\n';
}
export async function buildPublicInformationPages({check = false} = {}) {
  for (const page of PUBLIC_INFORMATION_PAGES) {
    const destination = path.join(webRoot, 'public', page.filename);
    const html = renderPublicInformationPage(page, process.env.VITE_PUBLIC_SITE_URL);
    if (check) {
      if (await fs.readFile(destination, 'utf8') !== html) throw Error('Página pública desatualizada: ' + page.filename);
    } else await fs.writeFile(destination, html);
  }
  console.log(PUBLIC_INFORMATION_PAGES.length + ' páginas públicas ' + (check ? 'verificadas.' : 'preparadas para publicação.'));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildPublicInformationPages({check:process.argv.includes('--check')});
}

