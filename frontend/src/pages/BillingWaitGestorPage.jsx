import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function BillingWaitGestorPage() {
  const { logout, user } = useAuth();
  const base = user?.role === 'child' ? '/child' : '/parent';

  return (
    <div className="trial-blocked">
      <div className="trial-blocked__card">
        <div className="trial-blocked__icon">📋</div>
        <h1 className="trial-blocked__title">Assinatura a cargo do gestor</h1>
        <p className="trial-blocked__desc">
          O período experimental terminou ou a assinatura da família precisa ser renovada.
          Este acesso só pode ser libertado pelo <strong>gestor financeiro da família</strong>
          — o pai/mãe que criou o grupo ou quem ficou definido como responsável pelo plano.
        </p>
        <p className="trial-blocked__desc" style={{ marginTop: 12 }}>
          Peça ao gestor para iniciar sessão e concluir a assinatura. Não há cobrança individual por
          membro da família: um único pagamento cobre todos os dependentes.
        </p>
        <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="btn btn-primary btn-lg" to={base}>Voltar ao início</Link>
          <button type="button" className="btn btn-ghost" onClick={() => logout()}>
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
