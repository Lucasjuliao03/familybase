import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { getMP, destroyBrick } from '../lib/mercadoPago';

const PLANS = [
  { code: 'premium_mensal', label: 'Mensal', price: 19.90, hint: 'Cobrança mensal recorrente',     featured: false },
  { code: 'premium_anual',  label: 'Anual',  price: 199.00, hint: 'Economize 2 meses (R$ 16,58/mês)', featured: true  },
];

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

export default function SubscribePage() {
  const { user, family, fetchMe, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const brickRef = useRef(null);

  const expired = useMemo(() => {
    if (!family) return false;
    if (family.subscription_status === 'active') return false;
    if (family.subscription_status === 'expired') return true;
    const ends = family.trial_ends_at ? new Date(family.trial_ends_at).getTime() : 0;
    return ends > 0 && ends < Date.now();
  }, [family]);

  // Inicializar Brick quando um plano é seleccionado
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const plan = PLANS.find((p) => p.code === selected);
    if (!plan) return;

    (async () => {
      try {
        destroyBrick('cardPaymentBrick_container');
        const { bricksBuilder } = getMP();
        if (cancelled) return;
        const controller = await bricksBuilder.create('cardPayment', 'cardPaymentBrick_container', {
          initialization: {
            amount: plan.price,
            payer: { email: user?.email || '' },
          },
          customization: {
            paymentMethods: { maxInstallments: 1 },
            visual: { style: { theme: 'default' } },
          },
          callbacks: {
            onReady: () => {/* brick pronto */},
            onError: (err) => {
              console.error('MP Brick error', err);
              toast.error('Erro no formulário de cartão. Tente recarregar a página.');
            },
            onSubmit: async (cardFormData) => {
              try {
                setSubmitting(true);
                const cardToken = cardFormData?.token || cardFormData?.formData?.token;
                if (!cardToken) throw new Error('Não foi possível tokenizar o cartão.');

                const { data: sessionData } = await supabase.auth.getSession();
                const accessToken = sessionData?.session?.access_token;
                const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mp-create-subscription`;
                const res = await fetch(url, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                  },
                  body: JSON.stringify({
                    plan_code: plan.code,
                    card_token_id: cardToken,
                    payer_email: cardFormData?.formData?.payer?.email || user?.email,
                  }),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) {
                  const detail = body?.detail != null ? JSON.stringify(body.detail) : '';
                  const msg = [body?.error, detail].filter(Boolean).join(' ');
                  throw new Error(msg || `Erro ${res.status} ao criar assinatura.`);
                }

                toast.success('Assinatura confirmada! Bem-vindo de volta.');
                await fetchMe();
                navigate('/parent', { replace: true });
              } catch (e) {
                toast.error(e?.message || 'Erro ao processar assinatura.');
              } finally {
                setSubmitting(false);
              }
            },
          },
        });
        if (cancelled) {
          controller.unmount();
          return;
        }
        window.cardPaymentBrickController = controller;
        brickRef.current = controller;
      } catch (e) {
        toast.error(e?.message || 'Não foi possível carregar o formulário de pagamento.');
      }
    })();

    return () => {
      cancelled = true;
      destroyBrick('cardPaymentBrick_container');
    };
  }, [selected, user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="trial-blocked">
      <div className="trial-blocked__card" style={{ maxWidth: 540 }}>
        <div className="trial-blocked__icon">{expired ? '⛔' : '⭐'}</div>
        <h1 className="trial-blocked__title">
          {expired ? 'O seu teste gratuito terminou' : 'Escolha o seu plano'}
        </h1>
        <p className="trial-blocked__desc">
          {expired
            ? 'Para continuar a usar a Base Familiar, escolha um plano e introduza os dados do cartão.'
            : 'Garanta o seu acesso continuado escolhendo um plano abaixo.'}
        </p>

        {!selected && (
          <div className="trial-blocked__plans">
            {PLANS.map((p) => (
              <button
                key={p.code}
                className={`plan-card ${p.featured ? 'is-featured' : ''}`}
                onClick={() => setSelected(p.code)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div className="plan-card__title">{p.label}</div>
                  <div className="plan-card__price">{fmtBRL(p.price)}</div>
                </div>
                <div className="plan-card__hint">{p.hint}</div>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div style={{ textAlign: 'left' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSelected(null)}
              disabled={submitting}
              style={{ marginBottom: 12 }}
            >
              ← Trocar plano
            </button>
            <div style={{
              padding: 12, borderRadius: 10, marginBottom: 12,
              background: 'var(--bg)', border: '1px solid var(--border)',
              fontSize: '0.88rem',
            }}>
              Plano <strong>{PLANS.find((p) => p.code === selected)?.label}</strong> — pagamento recorrente de{' '}
              <strong>{fmtBRL(PLANS.find((p) => p.code === selected)?.price || 0)}</strong>.
            </div>
            <div id="cardPaymentBrick_container" />
            {submitting && (
              <div style={{ textAlign: 'center', marginTop: 12, color: 'var(--text-light)' }}>
                A processar pagamento…
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'center' }}>
          {!expired && !selected && (
            <button className="btn btn-ghost" onClick={() => navigate(-1)}>
              Voltar
            </button>
          )}
          <button className="btn btn-ghost" onClick={async () => { await logout(); navigate('/login'); }}>
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
