import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { PLAY_APP_URL, PLAY_MANAGE_URL, playStatusLabel, subscriptionDestination } from '../lib/playBillingWeb';
import PlayDownloadBanner from '../components/web/PlayDownloadBanner';
import PlayStoreButton from '../components/web/PlayStoreButton';
import PromotionalPrice from '../components/web/PromotionalPrice';
import { DEFAULT_WEB_PLANS,displayPrice,formatBRL,annualSaving } from '../lib/webPlans';

export default function PlaySubscriptionPage() {
  const { user, effectiveSubscription, fetchMe, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(null);
  const entitlement = confirmed || effectiveSubscription;
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [catalog,setCatalog] = useState(null);
  const launch=catalog?.launch;
  const plans=catalog?.plans || DEFAULT_WEB_PLANS;
  useEffect(()=>{let active=true;supabase.rpc('web_public_catalog').then(({data,error})=>{if(active&&!error)setCatalog(data);});return()=>{active=false;};},[]);
  const check = useCallback(async () => {
    setChecking(true); setMessage('');
    try {
      const { data, error } = await supabase.rpc('get_effective_subscription');
      if (error || data?.ok !== true) throw new Error('Não foi possível consultar sua assinatura. Tente novamente.');
      setConfirmed(data);
      const updatedCatalog = await supabase.rpc('web_public_catalog');
      if (!updatedCatalog.error) setCatalog(updatedCatalog.data);
      if (data.has_access === true) { await fetchMe(); setMessage('Acesso confirmado. Sua família pode continuar.'); }
      else setMessage('A assinatura ainda não foi confirmada. No aplicativo Android, use Restaurar compra e tente novamente aqui.');
    } catch (e) { setMessage(e.message); }
    finally { setChecking(false); }
  }, [fetchMe]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [check]);
  const canManage = entitlement?.can_manage_billing === true;
  const active = entitlement?.has_access === true;
  return <div className="web-billing"><div className="web-billing-card">
    <a href="/"><img src="/brand/logo.webp" width="88" height="88" alt="Tudo de Família" /></a>
    <p className="web-kicker">ASSINATURA DA FAMÍLIA · GOOGLE PLAY</p>
    <h1>{active ? 'Sua família está conectada.' : 'Continue sua rotina em família.'}</h1>
    <p className="web-status">{playStatusLabel(entitlement)}</p>
    {entitlement?.subscription_expires_at && <p>Vigência confirmada até {new Date(entitlement.subscription_expires_at).toLocaleDateString('pt-BR')}.</p>}
    {canManage ? <>
      <p>A assinatura é contratada e gerenciada pela Google Play no aplicativo Android. Use a <strong>mesma conta Tudo de Família do gestor</strong> para vincular a compra à família correta.</p>
      <ol className="web-billing-steps"><li>Abra ou instale o aplicativo Android pela Google Play.</li><li>Entre com a conta do gestor e escolha o plano no aplicativo.</li><li>Se já pagou, use <strong>Restaurar compra</strong> no aplicativo. Depois volte aqui e verifique o acesso.</li></ol>
      {launch?.play_available === true ? <div className="web-action-row"><a className="btn btn-primary" href={launch.play_install_url || PLAY_APP_URL} target="_blank" rel="noopener noreferrer">Abrir na Google Play ↗</a><a className="btn btn-ghost" href={PLAY_MANAGE_URL} target="_blank" rel="noopener noreferrer">Gerenciar assinatura ↗</a></div> : <div className="web-inline-message" role="status"><strong>Assinaturas Google Play em preparação.</strong><p>A publicação do aplicativo ainda será configurada. A contratação ficará disponível após a liberação na loja. Seus dados e vínculos familiares continuam preservados.</p></div>}
      <p className="web-muted">Na Google Play, use a conta Google que realizou a compra. O preço e as condições são apresentados antes da confirmação. Se o aplicativo ainda estiver em teste, o acesso exige participação no programa de testes.</p>
      <div className="web-billing-plans">{plans.filter(p=>p.enabled).map(p=><article key={p.code} className={`web-billing-plan ${p.featured?'featured':''}`}><h2>{p.label}</h2><PromotionalPrice plan={p} className="web-plan-price" />{p.code==='premium_anual'?<p>Equivale a {formatBRL(displayPrice(p)/12)}/mês. Mais {formatBRL(annualSaving(plans))} de economia em comparação com 12 mensalidades promocionais. Cobrança anual de {formatBRL(displayPrice(p))}.</p>:<p>Flexibilidade para organizar sua família mês a mês.</p>}<PlayStoreButton available={launch?.play_available===true} url={launch?.play_install_url}/></article>)}</div>
      <p className="web-muted">Promoção de lançamento. Confira preço, elegibilidade, vigência da oferta e condições de renovação na Google Play antes de confirmar a compra.</p>
      <PlayDownloadBanner compact available={launch?.play_available===true} url={launch?.play_install_url}/>
    </> : <p>Peça ao gestor da família para regularizar a assinatura pelo aplicativo Android. Uma assinatura cobre o acesso da família conforme as permissões de cada membro.</p>}
    <div className="web-action-row"><button className="btn btn-primary" disabled={checking} onClick={check}>{checking ? 'Verificando…' : 'Já assinei · verificar acesso'}</button>{active && <button className="btn btn-ghost" onClick={() => navigate(subscriptionDestination(user, entitlement), { replace: true })}>Continuar para o painel →</button>}<button className="btn btn-ghost" onClick={logout}>Sair</button></div>
    {message && <p role="status" className="web-inline-message">{message}</p>}
    <p className="web-muted">Compras pendentes aguardam confirmação. Cancelar a renovação mantém o acesso até o fim da vigência confirmada. Dados e vínculos da família são preservados.</p>
  </div></div>;
}
