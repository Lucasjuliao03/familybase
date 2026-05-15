import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function TrialBanner() {
  const { family, user, effectiveSubscription } = useAuth();
  const navigate = useNavigate();

  const canManage = useMemo(() => {
    if (effectiveSubscription?.can_manage_billing === true) return true;
    if (effectiveSubscription?.can_manage_billing === false) return false;
    if (!user || user.role === 'child' || user.role === 'relative') return false;
    if (user.role === 'parent') {
      return (user.access_profile ?? user.accessProfile ?? 'gestor') === 'gestor';
    }
    return false;
  }, [effectiveSubscription, user]);

  const info = useMemo(() => {
    if (!family) return null;
    const status = family.subscription_status;
    if (!status || status === 'active') return null;

    const ends = family.trial_ends_at ? new Date(family.trial_ends_at) : null;
    const msLeft = ends ? ends.getTime() - Date.now() : 0;
    const daysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
    const expired = status === 'expired' || (status === 'trial' && msLeft <= 0);

    return { status, daysLeft, expired };
  }, [family]);

  if (!info) return null;

  const goPay = () => {
    if (!canManage) {
      navigate('/billing-wait-gestor');
      return;
    }
    navigate('/subscribe');
  };

  if (info.expired) {
    return (
      <div className="trial-banner is-expired">
        <span>
          ⛔{' '}
          {canManage
            ? 'O teste gratuito terminou. Assine para continuar a usar a Base Familiar.'
            : 'O acesso da família depende do gestor. Peça ao responsável pela assinatura para regularizar.'}
        </span>
        {canManage ? (
          <button type="button" className="trial-banner__btn" onClick={goPay}>
            Assinar agora
          </button>
        ) : (
          <button type="button" className="trial-banner__btn" onClick={() => navigate('/billing-wait-gestor')}>
            Detalhes
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="trial-banner">
      <span>
        🎁 Está no <strong>teste gratuito</strong> — {info.daysLeft} {info.daysLeft === 1 ? 'dia restante' : 'dias restantes'}.
        {!canManage && ' A assinatura é gerida apenas pelo gestor da família.'}
      </span>
      {canManage && (
        <button type="button" className="trial-banner__btn" onClick={goPay}>
          Ver planos
        </button>
      )}
    </div>
  );
}
