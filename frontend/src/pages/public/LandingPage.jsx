import { useEffect, useState } from 'react';
import { WEB_MODULES } from '../../lib/webNavigation';
import { DEFAULT_WEB_PLANS,formatBRL,displayPrice,annualSaving } from '../../lib/webPlans';
import PlayStoreButton from '../../components/web/PlayStoreButton';
import PlayDownloadBanner from '../../components/web/PlayDownloadBanner';
import PromotionalPrice from '../../components/web/PromotionalPrice';
import LandingProductPreview from '../../components/web/LandingProductPreview';
import '../../styles/marketing/landing.css';
import '../../styles/marketing/professional.css';

const mascots = [
  ['lili', 'Lili', 'Coragem para tentar', '#FDE8EE'], ['tobe', 'Tobe', 'Curiosidade para aprender', '#DFF8EE'],
  ['pipo', 'Pipo', 'Alegria em cada conquista', '#FFF0D9'], ['luca', 'Luca', 'Juntos a gente consegue', '#E1F1FF'],
];
const questions = [
  ['Posso usar a mesma conta no aplicativo e no computador?', 'Sim. Entre com seu acesso existente. Os módulos usam o mesmo backend e os mesmos vínculos familiares.'],
  ['Cada pessoa tem seu próprio acesso?', 'Sim. Gestores, responsáveis, crianças e parentes têm acessos conforme seu perfil e as permissões definidas pela família.'],
  ['Como funciona a assinatura?', 'O gestor contrata o plano mensal ou anual pelo aplicativo Android, com pagamento pela Google Play. O preço e as condições são apresentados na loja. Depois, a família também acessa a plataforma web.'],
  ['Preciso cadastrar a família novamente?', 'Se sua família já usa o aplicativo, basta entrar. O cadastro é necessário apenas para novas famílias.'],
];

export default function LandingPage() {
  const [catalog, setCatalog] = useState(null);
  useEffect(() => {
    let active = true;
    import('../../lib/publicCatalog').then(({loadPublicCatalog}) => loadPublicCatalog())
      .then(data => { if (active) setCatalog(data); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const plans = catalog?.plans || DEFAULT_WEB_PLANS;
  const saving = annualSaving(plans);
  const playAvailable = catalog?.launch?.play_available === true;
  return (
    <div className="public-site">
      <a className="site-skip" href="#conteudo">Pular para o conteúdo</a>
      <header className="site-header site-wrap">
        <a href="/" className="site-brand" aria-label="Tudo de Família — início"><img src="/brand/logo.webp" width="64" height="64" alt="Tudo de Família" /><span>Tudo de Família<small>Mais tempo para estar junto.</small></span></a>
        <nav aria-label="Navegação principal"><a href="#recursos">Recursos</a><a href="#como-funciona">Como funciona</a><a href="#planos">Planos</a><a href="/login" className="site-login">Entrar</a><a href="/register" className="site-button small">Criar Tudo de Família <span aria-hidden="true">↗</span></a></nav>
      </header>
      <main id="conteudo">
        <section className="site-hero site-wrap">
          <div className="site-hero-copy">
            <p className="site-eyebrow"><span /> UMA ROTINA MAIS LEVE COMEÇA EM CASA</p>
            <h1>Organize a rotina.<br/>Acompanhe sua família.<br/><em>Tudo em um lugar.</em></h1>
            <p className="site-lead">Troque lembretes repetidos por combinados claros. Reúna tarefas, escola, mesada e cuidados em um só lugar — e abra espaço para o que vocês mais gostam de fazer juntos.</p>
            <div className="site-actions"><a href="/register" className="site-button">Criar Tudo de Família <span aria-hidden="true">→</span></a><a href="#planos" className="site-text-link">Ver promoção a partir de R$ 19,90 ↓</a></div>
            <p className="site-conversion-note">Uma assinatura para sua família. Cada pessoa com seu próprio perfil.</p>
            <div className="site-hero-proof"><div className="site-avatar-stack">{['bia', 'caio', 'nina'].map(a => <img key={a} src={`/avatar/${a}.png`} width="38" height="38" alt="" />)}</div><p>Um espaço para cada pessoa.<br /><strong>Uma família mais conectada.</strong></p></div>
            <PlayStoreButton available={playAvailable} url={catalog?.launch?.play_install_url} className="site-hero-store" />
          </div>
          <LandingProductPreview/>
        </section>
        <div className="site-benefit-bar"><div className="site-wrap"><span>✓ Web e aplicativo conectados</span><span>✓ Acessos por perfil</span><span>✓ Rotina com propósito</span><span>✓ Identidade para cada família</span></div></div>
        <section id="recursos" className="site-section site-wrap">
          <div className="site-section-heading"><div><p className="site-eyebrow">TUDO SE CONECTA</p><h2>A vida em família,<br />organizada de verdade.</h2></div><p>Do primeiro compromisso do dia à última tarefa da noite. Cada módulo ajuda sua família a cuidar do que importa.</p></div>
          <div className="site-module-grid">{WEB_MODULES.map(m => <article key={m.key} className="site-module"><img loading="lazy" src={`/icons/mobile/${m.icon}.png`} width="56" height="56" alt="" /><h3>{m.label}</h3><p>{m.description}</p></article>)}</div>
        </section>
        <section id="como-funciona" className="site-how"><div className="site-wrap site-how-grid"><div><p className="site-eyebrow">COMEÇAR É SIMPLES</p><h2>Uma casa.<br />Muitas pessoas.<br /><em>Todos participam.</em></h2><p>Você organiza os acessos. Cada pessoa encontra seu espaço para participar, aprender e ajudar.</p><a className="site-button" href="/register">Criar Tudo de Família →</a></div><ol>{[['Crie seu Tudo de Família', 'Cadastre seu espaço e personalize os perfis com os avatares do aplicativo.'], ['Combine a rotina', 'Organize tarefas, compromissos e metas. Defina os módulos e os acessos de cada pessoa.'], ['Acompanhe e celebre', 'Visualize a evolução pelo computador e continue a rotina no aplicativo.']].map(([title, text], i) => <li key={title}><span>0{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></div></section>
        <section className="site-section site-wrap site-friends"><p className="site-eyebrow">IDENTIDADE PARA CADA PERFIL</p><h2>Personalidade que acompanha a família.</h2><p>Avatares individuais na web e mascotes no aplicativo tornam cada perfil reconhecível.</p><div className="site-mascots">{mascots.map(([id, name, phrase, color]) => <article key={id} style={{ background: color }}><img loading="lazy" src={`/brand/${id}.webp`} width="240" height="240" alt={`Mascote ${name}`} /><h3>{name}</h3><p>{phrase}</p></article>)}</div></section>
        <section id="planos" className="site-plans"><div className="site-wrap"><p className="site-eyebrow">PROMOÇÃO DE LANÇAMENTO</p><h2>Mais leveza na rotina.<br />Uma oferta para começar juntos.</h2><p>Todos os recursos para sua família, com preços promocionais. Escolha a flexibilidade do mensal ou a economia do anual.</p><div className="site-plan-grid">{plans.filter(p => p.enabled).map(p => <article key={p.code} className={`site-plan ${p.featured ? 'featured' : ''}`}>
          {p.featured && <span className="site-plan-tag">MAIOR ECONOMIA</span>}<h3>{p.label}</h3><p>{p.description}</p><PromotionalPrice plan={p} />
          {p.code==='premium_anual' ? <><p className="site-plan-equivalent">Equivale a <strong>{formatBRL(displayPrice(p)/12)}/mês</strong></p>{saving>0&&<div className="site-savings">Mais {formatBRL(saving)} de economia no anual<span>Em comparação com 12 mensalidades promocionais.</span></div>}</> : <><p className="site-plan-equivalent">Cobrança mensal pela Google Play.</p><div className="site-plan-flex-note">Comece no seu ritmo.<span>Flexibilidade para decidir mês a mês.</span></div></>}
          <ul>{p.features.map(f => <li key={f}>✓ {f}</li>)}</ul><a href={`/register?plano=${p.code}`} className="site-button" aria-label={`Criar Tudo de Família com plano ${p.label}`}>Criar Tudo de Família →</a><small className="site-plan-billing">{p.code==='premium_anual'?`Cobrança anual de ${formatBRL(displayPrice(p))}.`:'Renovação mensal. Gerencie pela Google Play.'}</small>
        </article>)}</div>{!playAvailable && <p className="site-plan-note">Promoção prevista para o lançamento. Aplicativo Android e assinaturas em preparação para publicação.</p>}<small className="site-plan-note">Crie seu Tudo de Família. A compra acontece no aplicativo Android, pela Google Play. Confira preço, elegibilidade, vigência da oferta e condições de renovação na loja antes de confirmar.</small></div></section>
        <div className="site-wrap site-download-section"><PlayDownloadBanner available={playAvailable} url={catalog?.launch?.play_install_url} /></div>
        {catalog?.content?.length > 0 && <section className="site-section site-wrap"><h2>Novidades da família</h2><div className="site-module-grid">{catalog.content.map(c => <article className="site-module" key={c.id}><h3>{c.title}</h3><p>{c.body}</p></article>)}</div></section>}
        <section className="site-section site-wrap site-faq"><div><p className="site-eyebrow">PODE CHEGAR</p><h2>Algumas respostas<br />antes de começar.</h2></div><div>{questions.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>
        <section className="site-final site-wrap"><div><p className="site-eyebrow">O MELHOR DA ROTINA É VIVER JUNTO</p><h2>Organize os combinados.<br />Aproveite os momentos.</h2><p>Crie seu Tudo de Família e dê o primeiro passo para uma rotina mais leve.</p></div><a href="/register" className="site-button">Criar Tudo de Família →</a></section>
      </main>
      <footer className="site-footer site-wrap"><a className="site-brand" href="/"><img src="/brand/logo.webp" width="52" height="52" alt="" /><strong>Tudo de Família</strong></a><nav aria-label="Links do rodapé"><a href="/privacy.html">Privacidade</a><a href="/terms.html">Termos de uso</a><a href="/cancellation.html">Cancelamento</a><a href="/support.html">Suporte</a><a href="/account-privacy.html">Conta e privacidade</a><a href="/deletion.html">Excluir conta</a><a href="/login">Acessar minha conta</a></nav><small>© {new Date().getFullYear()} Tudo de Família. Feito para a vida em família.</small></footer>
    </div>
  );
}
