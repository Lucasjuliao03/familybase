import { Link, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { familyWebAccessState } from '../lib/familyWebAccess';
import { subscriptionDestination } from '../lib/playBillingWeb';
import PageLoader from '../components/PageLoader';
import { ModuleIcon } from '../components/web/ModuleTitle';

export default function BillingWaitGestorPage() {
  const { logout, user, fetchMe, effectiveSubscription, loading, profileLoading } = useAuth();
  const [checking,setChecking] = useState(false);
  const [message,setMessage] = useState('');
  const check = async () => {
    setChecking(true); setMessage('');
    try {
      const data = await fetchMe();
      if (data?.ok !== true) throw new Error('verification_unavailable');
      if (!data.has_access) setMessage('O acesso ainda depende da confirmação da assinatura pelo gestor.');
    } catch { setMessage('Não foi possível verificar agora. Tente novamente.'); }
    finally { setChecking(false); }
  };
  const state = familyWebAccessState(user, effectiveSubscription, { loading, profileLoading });
  if (state === 'checking') return <PageLoader message="Verificando o acesso da família…" />;
  if (state === 'signed_out') return <Navigate to="/login" replace />;
  if (state === 'no_family') return <Navigate to="/register" replace />;
  if (state === 'allowed') return <Navigate to={subscriptionDestination(user, effectiveSubscription)} replace />;
  const unavailable = state === 'unavailable';

  return (
    <div className="trial-blocked">
      <div className="trial-blocked__card">
        <div className="trial-blocked__icon"><ModuleIcon icon="users" nativeIcon="📋" size={32}/></div>
        <h1 className="trial-blocked__title">{unavailable ? 'Vamos confirmar seu acesso' : 'Assinatura a cargo do gestor'}</h1>
        <p className="trial-blocked__desc">
          {unavailable ? 'A consulta de acesso não foi concluída. Verifique sua conexão e tente novamente para continuar com a mesma conta da família.' : <>O período experimental terminou ou a assinatura da família precisa ser renovada.
          Este acesso só pode ser libertado pelo <strong>gestor financeiro da família</strong>
          — o pai/mãe que criou o grupo ou quem ficou definido como responsável pelo plano.</>}
        </p>
        {!unavailable && <p className="trial-blocked__desc" style={{ marginTop: 12 }}>
          Peça ao gestor para entrar no aplicativo Android e concluir a assinatura pela Google Play. Não há cobrança individual por
          membro da família: um único pagamento cobre todos os dependentes.
        </p>}
        <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-lg" disabled={checking} onClick={check}>{checking?'Verificando…':unavailable?'Tentar novamente':'Verificar acesso da família'}</button>
          {!unavailable && <Link className="btn btn-ghost" to="/subscribe">Orientações</Link>}
          <button type="button" className="btn btn-ghost" onClick={() => logout()}>
            Sair
          </button>
        </div>
        {message && <p role="status">{message}</p>}
      </div>
    </div>
  );
}
