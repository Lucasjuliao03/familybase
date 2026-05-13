import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function TrialBanner() {
  const { family } = useAuth();
  const navigate = useNavigate();

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

  if (info.expired) {
    return (
      <div className="trial-banner is-expired">
        <span>⛔ O seu teste gratuito terminou. Assine para continuar a usar a Base Familiar.</span>
        <button className="trial-banner__btn" onClick={() => navigate('/subscribe')}>
          Assinar agora
        </button>
      </div>
    );
  }

  return (
    <div className="trial-banner">
      <span>
        🎁 Está no <strong>teste gratuito</strong> — {info.daysLeft} {info.daysLeft === 1 ? 'dia restante' : 'dias restantes'}.
      </span>
      <button className="trial-banner__btn" onClick={() => navigate('/subscribe')}>
        Ver planos
      </button>
    </div>
  );
}
