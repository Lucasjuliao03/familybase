import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';

/** Valores espelho dos preços Stripe (BRL) — produtos “Base Familiar mensal / Anual”. */
const PLANS = [
  {
    code: 'premium_mensal',
    label: 'Mensal',
    price: 19.9,
    interval: '/mês',
    hint: 'Cobrança automática todos os meses. Cancelável na área Stripe.',
    features: ['Toda a Base Familiar premium', 'Suporte a famílias gestor/conta', 'Actualizações contínuas'],
    featured: false,
  },
  {
    code: 'premium_anual',
    label: 'Anual',
    price: 199.9,
    interval: '/ano',
    hint: `Equivale a cerca de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(199.9 / 12)} por mês.`,
    features: ['Toda a Base Familiar premium', 'Melhor valor para usar o ano todo', 'Factura única recorrente anual'],
    featured: true,
  },
];

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function statusBadge(label, tone = 'muted') {
  const tones = {
    active: { bg: '#00B89422', border: '#00B894', color: '#00B894' },
    warn: { bg: '#FDCB6E22', border: '#F39C12', color: '#D35400' },
    bad: { bg: '#FF767522', border: '#E17055', color: '#D63031' },
    muted: { bg: 'var(--bg)', border: 'var(--border)', color: 'var(--text-light)' },
  };
  const t = tones[tone] || tones.muted;
  return (
    <span
      className="billing-subscribe__badge"
      style={{ background: t.bg, borderColor: t.border, color: t.color }}
    >
      {label}
    </span>
  );
}

export default function SubscribePage() {
  const { family, fetchMe, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [billingSuccess, setBillingSuccess] = useState(false);
  const [stripeSummary, setStripeSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const handledCancelRef = useRef(false);
  const syncedSessionRef = useRef(null);

  const isGestorContext = typeof window !== 'undefined' && window.location.pathname.includes('/parent/billing');

  const loadStripeSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) return;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-get-billing-summary`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setStripeSummary(body);
      else setStripeSummary(null);
    } catch {
      setStripeSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (family?.subscription_status === 'active' || family?.subscription_id?.startsWith?.('sub_')) {
      loadStripeSummary();
    }
  }, [family?.subscription_status, family?.subscription_id, loadStripeSummary]);

  const expired = useMemo(() => {
    if (!family) return false;
    if (family.subscription_status === 'active') return false;
    if (family.subscription_status === 'expired') return true;
    const ends = family.trial_ends_at ? new Date(family.trial_ends_at).getTime() : 0;
    return ends > 0 && ends < Date.now();
  }, [family]);

  const familyBillingLabel = useMemo(() => {
    const s = family?.subscription_status;
    if (s === 'active') return { text: 'Assinatura activa', tone: 'active' };
    if (s === 'past_due') return { text: 'Pagamento em atraso', tone: 'warn' };
    if (s === 'cancelled') return { text: 'Assinatura cancelada', tone: 'bad' };
    if (s === 'expired' || expired) return { text: 'Período gratuito expirado', tone: 'bad' };
    return { text: 'Período de experiência', tone: 'muted' };
  }, [family?.subscription_status, expired]);

  useEffect(() => {
    if (searchParams.get('checkout') !== 'cancelled') return;
    if (handledCancelRef.current) return;
    handledCancelRef.current = true;
    toast.info('Pagamento cancelado. Pode tentar novamente quando quiser.');
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    const sessionId = searchParams.get('session_id');
    if (checkout !== 'success' || !sessionId) return;

    const dedupeKey = `stripe_ck_done_${sessionId}`;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(dedupeKey)) {
      setBillingSuccess(true);
      return;
    }
    if (syncedSessionRef.current === sessionId) return;
    syncedSessionRef.current = sessionId;

    let cancelled = false;
    (async () => {
      try {
        setSubmitting(true);
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        const syncUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-sync-checkout-session`;
        const res = await fetch(syncUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = [body?.error, body?.status].filter(Boolean).join(' ');
          throw new Error(msg || `Erro ${res.status} ao confirmar pagamento.`);
        }
        if (cancelled) return;
        await fetchMe();
        await loadStripeSummary();
        try {
          sessionStorage.setItem(dedupeKey, '1');
        } catch {/* */}
        toast.success('Assinatura confirmada!');
        setBillingSuccess(true);
        setSearchParams({}, { replace: true });
      } catch (e) {
        if (!cancelled) {
          syncedSessionRef.current = null;
          toast.error(
            e?.message
              || 'Não foi possível confirmar o pagamento. O webhook pode activar o acesso em breve.',
          );
        }
        setSearchParams({}, { replace: true });
      } finally {
        if (!cancelled) setSubmitting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams, fetchMe, toast, loadStripeSummary]);

  async function openBillingPortal() {
    try {
      setSubmitting(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const portalUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-portal-session`;
      const origin = window.location.origin.replace(/\/$/, '');
      const returnPath = isGestorContext ? `${origin}/parent/billing` : `${origin}/parent`;
      const res = await fetch(portalUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ return_url: returnPath }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Erro ${res.status}`);
      if (!body?.url) throw new Error('Resposta sem URL do portal Stripe.');
      window.location.href = body.url;
    } catch (e) {
      toast.error(e?.message || 'Não foi possível abrir a gestão de cobrança.');
      setSubmitting(false);
    }
  }

  async function startStripeCheckout(planCode) {
    try {
      setSubmitting(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const createUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-checkout-session`;
      const res = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ plan_code: planCode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `Erro ${res.status} ao iniciar pagamento.`);
      }
      if (!body?.url) {
        throw new Error('Resposta inválida do servidor (sem URL de checkout).');
      }
      window.location.href = body.url;
    } catch (e) {
      toast.error(e?.message || 'Erro ao abrir o pagamento.');
      setSubmitting(false);
    }
  }

  const periodEndFmt = stripeSummary?.current_period_end
    ? new Date(stripeSummary.current_period_end * 1000).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    : null;

  if (billingSuccess) {
    return (
      <div className="trial-blocked billing-subscribe billing-subscribe--wide">
        <div className="trial-blocked__card billing-subscribe__card billing-subscribe__card--success">
          <div className="trial-blocked__icon billing-subscribe__icon--ok">✓</div>
          <h1 className="trial-blocked__title">Pagamento bem-sucedido</h1>
          <p className="trial-blocked__desc" style={{ marginBottom: 18 }}>
            A sua assinatura recorrente foi activada. Pode gerir método de pagamento e facturas com segurança no
            Stripe, ou entrar já na Base Familiar.
          </p>
          <div className="billing-subscribe__actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting}
              onClick={() => navigate(isGestorContext ? '/parent/billing' : '/parent', { replace: true })}
            >
              Continuar na app
            </button>
            <button type="button" className="btn btn-ghost" disabled={submitting} onClick={openBillingPortal}>
              {submitting ? 'A abrir…' : 'Gerir cobrança no Stripe'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const showPortalCta =
    stripeSummary?.has_stripe_subscription
    || (family?.subscription_status === 'active' && stripeSummary?.family_status?.stripe_customer_id);

  return (
    <div className="trial-blocked billing-subscribe billing-subscribe--wide">
      <div className="trial-blocked__card billing-subscribe__card">
        <div className="billing-subscribe__hero">
          <div className="trial-blocked__icon">{expired ? '⛔' : '💳'}</div>
          <div>
            <h1 className="trial-blocked__title" style={{ marginBottom: 6 }}>
              {isGestorContext ? 'Assinatura e pagamento' : expired ? 'Renove a sua assinatura' : 'Planos Base Familiar'}
            </h1>
            <p className="trial-blocked__desc" style={{ marginBottom: 10 }}>
              Pagamento seguro com cartão e métodos suportados pelo Stripe. Assinatura recorrente — pode alterar ou
              cancelar na área de gestão do Stripe quando quiser.
            </p>
            <div className="billing-subscribe__status-row">
              {statusBadge(familyBillingLabel.text, familyBillingLabel.tone)}
              {summaryLoading && <span className="billing-subscribe__muted">A carregar detalhes Stripe…</span>}
              {periodEndFmt && stripeSummary?.status === 'active' && !stripeSummary?.cancel_at_period_end && (
                <span className="billing-subscribe__muted">
                  Próxima renovação: <strong>{periodEndFmt}</strong>
                </span>
              )}
              {stripeSummary?.cancel_at_period_end && (
                <span className="billing-subscribe__muted" style={{ color: 'var(--text-light)' }}>
                  Cancelamento agendado — permanece activo até ao fim do período pago.
                </span>
              )}
            </div>
          </div>
        </div>

        {showPortalCta && (
          <div className="billing-subscribe__portal-bar">
            <div>
              <strong>Já tem assinatura Stripe</strong>
              <p className="billing-subscribe__muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                Actualize cartão, veja facturas ou cancele a renovação no portal oficial.
              </p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={submitting} onClick={openBillingPortal}>
              Abrir portal Stripe
            </button>
          </div>
        )}

        {!selected && (
          <div className="billing-subscribe__plans">
            {PLANS.map((p) => (
              <div
                key={p.code}
                className={`billing-subscribe__plan ${p.featured ? 'is-featured' : ''}`}
              >
                <div className="billing-subscribe__plan-head">
                  <div>
                    <div className="plan-card__title">{p.label}</div>
                    <div className="billing-subscribe__plan-price">
                      {fmtBRL(p.price)}
                      <span className="billing-subscribe__interval">{p.interval}</span>
                    </div>
                  </div>
                  {p.featured && <span className="billing-subscribe__pill">Recomendado</span>}
                </div>
                <p className="billing-subscribe__muted" style={{ fontSize: '0.88rem', margin: '8px 0 12px' }}>
                  {p.hint}
                </p>
                <ul className="billing-subscribe__features">
                  {p.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn-primary billing-subscribe__plan-cta"
                  disabled={submitting}
                  onClick={() => setSelected(p.code)}
                >
                  Escolher {p.label.toLowerCase()}
                </button>
              </div>
            ))}
          </div>
        )}

        {selected && (
          <div className="billing-subscribe__confirm">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelected(null)}
              disabled={submitting}
              style={{ marginBottom: 12 }}
            >
              ← Ver todos os planos
            </button>
            <div className="billing-subscribe__confirm-box">
              <h3 className="billing-subscribe__confirm-title">Confirmar e pagar</h3>
              <p>
                Plano <strong>{PLANS.find((p) => p.code === selected)?.label}</strong> —{' '}
                <strong>
                  {fmtBRL(PLANS.find((p) => p.code === selected)?.price || 0)}
                  {PLANS.find((p) => p.code === selected)?.interval}
                </strong>
                .
              </p>
              <p className="billing-subscribe__muted" style={{ fontSize: '0.88rem' }}>
                Será redireccionado para uma página hospedada pelo Stripe para concluir o pagamento seguro da
                assinatura recorrente.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 12 }}
                disabled={submitting}
                onClick={() => startStripeCheckout(selected)}
              >
                {submitting ? 'A preparar checkout…' : 'Ir para Stripe Checkout'}
              </button>
            </div>
          </div>
        )}

        {submitting && !selected && (
          <p className="billing-subscribe__muted" style={{ textAlign: 'center', marginTop: 12 }}>
            A processar…
          </p>
        )}

        <footer className="billing-subscribe__footer">
          {!expired && !selected && (
            <>
              {!isGestorContext && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
                  Voltar
                </button>
              )}
              {isGestorContext && (
                <Link to="/parent" className="btn btn-ghost btn-sm" replace>
                  ← Painel principal
                </Link>
              )}
            </>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Sair
          </button>
          <span className="billing-subscribe__stripe-note">Pagamentos processados por Stripe</span>
        </footer>
      </div>
    </div>
  );
}
