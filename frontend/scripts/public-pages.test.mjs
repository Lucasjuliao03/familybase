import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PUBLIC_INFORMATION_PAGES, SUPPORT_EMAIL } from '../src/lib/publicInformation.js';
import { renderPublicInformationPage } from './build-public-pages.mjs';

test('all six information pages are public, accessible and generated without scripts or forms', async () => {
  assert.deepEqual(PUBLIC_INFORMATION_PAGES.map(page=>page.filename), ['privacy.html','terms.html','cancellation.html','support.html','account-privacy.html','deletion.html']);
  for (const page of PUBLIC_INFORMATION_PAGES) {
    const html=await fs.readFile(new URL('../public/'+page.filename,import.meta.url),'utf8');
    assert.equal(html,renderPublicInformationPage(page,process.env.VITE_PUBLIC_SITE_URL));
    assert.equal((html.match(/<h1>/g)||[]).length,1);
    assert.match(html,/<html lang="pt-BR">/);
    assert.match(html,/id="conteudo"/);
    assert.match(html,/Pular para o conteúdo/);
    assert.match(html,/aria-current="page"/);
    assert.ok(html.includes('mailto:'+SUPPORT_EMAIL));
    assert.doesNotMatch(html,/<(?:script|form|input|iframe)\b/i);
    assert.doesNotMatch(html,/localhost|TODO|seu-email@|example\.com/);
  }
});

test('each document links to every public information destination without dead local document links', () => {
  const filenames=new Set(PUBLIC_INFORMATION_PAGES.map(page=>page.filename));
  for(const page of PUBLIC_INFORMATION_PAGES) {
    const html=renderPublicInformationPage(page);
    for(const filename of filenames) assert.ok(html.includes('href="/'+filename+'"'));
    for(const [,filename] of html.matchAll(/href="\/([^"]+\.html)"/g)) assert.ok(filenames.has(filename),filename);
  }
});

test('cancellation and deletion give separate real instructions and never promise automatic reimbursement', () => {
  const cancellation=renderPublicInformationPage(PUBLIC_INFORMATION_PAGES.find(page=>page.key==='cancellation'));
  const deletion=renderPublicInformationPage(PUBLIC_INFORMATION_PAGES.find(page=>page.key==='deletion'));
  assert.match(cancellation,/https:\/\/play.google.com\/store\/account\/subscriptions/);
  assert.match(cancellation,/não garante reembolso automático/);
  assert.match(deletion,/não cancela as cobranças da loja/);
  assert.match(deletion,/Confirmaremos sua identidade/);
  assert.match(deletion,/Não envie senha nem código de confirmação/);
});

test('document renderer escapes content and rejects executable links and unsafe canonical origins', () => {
  const page=PUBLIC_INFORMATION_PAGES[0];
  const escaped=renderPublicInformationPage({...page,title:'<script>alert(1)</script>',sections:[{title:'<h2>',paragraphs:['<img onerror="x">']}]});
  assert.ok(escaped.includes('&lt;script&gt;'));
  assert.doesNotMatch(escaped,/<script>/);
  assert.throws(()=>renderPublicInformationPage({...page,sections:[{title:'Invalid',links:[{label:'link',href:'javascript:alert(1)'}]}]}));
  assert.throws(()=>renderPublicInformationPage(page,'http://public.example'));
  assert.throws(()=>renderPublicInformationPage(page,'https://user:password@public.example'));
});

