import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Linking,
  Platform,
  StatusBar,
  Alert,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { supabase } from '../src/lib/supabase';
import { Colors, Radii, FontSize, Shadow } from '../src/theme';

const PLANS = [
  {
    code: 'premium_mensal',
    label: 'Mensal',
    price: 'R$ 19,90',
    interval: '/mês',
    hint: 'Cobrança mensal automática. Cancelável no Stripe.',
    features: ['Acesso total premium', 'Suporte a gestores', 'Novidades e atualizações'],
  },
  {
    code: 'premium_anual',
    label: 'Anual',
    price: 'R$ 199,90',
    interval: '/ano',
    hint: 'Melhor valor — equivalente a R$ 16,66/mês.',
    features: ['Acesso total premium', 'Melhor custo-benefício', 'Faturamento único anual'],
    featured: true,
  },
];

export default function SubscribeScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { family, logout, refreshProfile } = useAuth();
  
  const isGestorContext = pathname.includes('/parent/billing');
  
  const [selected, setSelected] = useState<string | null>('premium_anual');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [stripeSummary, setStripeSummary] = useState<any | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const loadStripeSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      setError(null);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) return;

      const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!baseUrl) throw new Error('Configuração Supabase ausente.');

      const url = `${baseUrl}/functions/v1/stripe-get-billing-summary`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setStripeSummary(body);
      } else {
        setStripeSummary(null);
      }
    } catch (e: any) {
      console.warn('[Stripe Summary] erro:', e.message);
      setStripeSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (family?.subscription_status === 'active' || (family?.subscription_id && String(family.subscription_id).startsWith('sub_'))) {
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

  const startCheckout = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

      const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!baseUrl) throw new Error('Configuração Supabase ausente.');

      const checkoutReturnPath = isGestorContext ? '/parent/billing' : '/subscribe';

      const res = await fetch(`${baseUrl}/functions/v1/stripe-create-checkout-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          plan_code: selected,
          checkout_return_path: checkoutReturnPath,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || json?.message || 'Erro ao iniciar pagamento.');

      const url = json?.url || json?.checkout_url;
      if (!url) throw new Error('URL de checkout não recebida.');

      await Linking.openURL(url);
    } catch (e: any) {
      setError(e.message);
      Alert.alert('Erro', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openBillingPortal = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

      const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!baseUrl) throw new Error('Configuração Supabase ausente.');

      const res = await fetch(`${baseUrl}/functions/v1/stripe-create-portal-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || json?.message || 'Erro ao abrir portal de faturamento.');

      const url = json?.url;
      if (!url) throw new Error('URL do portal não recebida.');

      await Linking.openURL(url);
    } catch (e: any) {
      setError(e.message);
      Alert.alert('Erro', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const familyBillingLabel = useMemo(() => {
    const s = family?.subscription_status;
    if (s === 'active') return { text: 'Assinatura Ativa', color: '#10B981' };
    if (s === 'past_due') return { text: 'Pagamento Pendente', color: '#F59E0B' };
    if (s === 'cancelled') return { text: 'Cancelada', color: '#EF4444' };
    if (s === 'expired' || expired) return { text: 'Expirado', color: '#EF4444' };
    return { text: 'Período de Testes', color: '#6B7280' };
  }, [family?.subscription_status, expired]);

  const periodEndFmt = useMemo(() => {
    if (!stripeSummary?.current_period_end) return null;
    return new Date(stripeSummary.current_period_end * 1000).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [stripeSummary]);

  const showPortalCta = stripeSummary?.has_stripe_subscription || 
    (family?.subscription_status === 'active' && stripeSummary?.family_status?.stripe_customer_id);

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.icon}>{expired ? '⛔' : '💳'}</Text>
        <Text style={s.title}>{isGestorContext ? 'Assinatura e Pagamento' : expired ? 'Renove sua assinatura' : 'Planos Tudo de Casa'}</Text>
        
        <Text style={s.desc}>
          {isGestorContext 
            ? 'Gerencie os métodos de pagamento e as cobranças de sua conta familiar com segurança pelo Stripe.'
            : `O período experimental da família ${family?.name ? `"${family.name}"` : ''} terminou. Escolha um plano para continuar.`}
        </Text>

        {/* Status da Assinatura */}
        <View style={s.statusCard}>
          <Text style={s.statusTitle}>Status Familiar</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <View style={[s.statusIndicator, { backgroundColor: familyBillingLabel.color }]} />
            <Text style={[s.statusText, { color: familyBillingLabel.color }]}>{familyBillingLabel.text}</Text>
          </View>
          {periodEndFmt && stripeSummary?.status === 'active' && !stripeSummary?.cancel_at_period_end && (
            <Text style={s.statusPeriod}>Próxima renovação: {periodEndFmt}</Text>
          )}
          {stripeSummary?.cancel_at_period_end && (
            <Text style={[s.statusPeriod, { color: '#EF4444' }]}>Cancelamento agendado — ativo até {periodEndFmt}</Text>
          )}
        </View>

        {summaryLoading ? (
          <View style={{ marginVertical: 20 }}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={{ color: '#fff', textAlign: 'center', marginTop: 8, fontSize: FontSize.xs }}>Carregando detalhes do faturamento...</Text>
          </View>
        ) : showPortalCta ? (
          /* Se já tiver uma assinatura ativa, mostrar gerenciador Stripe */
          <View style={s.portalCard}>
            <Text style={s.portalTitle}>Assinatura gerenciada via Stripe</Text>
            <Text style={s.portalDesc}>Você pode atualizar seu cartão de crédito, baixar faturas ou cancelar a renovação automática no portal oficial do Stripe.</Text>
            <TouchableOpacity style={s.primaryBtn} onPress={openBillingPortal} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Abrir Portal Stripe ⚙️</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          /* Senão, mostrar seleção de planos */
          <View style={{ width: '100%' }}>
            {PLANS.map((plan) => (
              <TouchableOpacity
                key={plan.code}
                style={[
                  s.planCard, 
                  selected === plan.code && s.planCardActive,
                ]}
                onPress={() => setSelected(plan.code)}
                activeOpacity={0.85}
              >
                {plan.featured && <Text style={s.badge}>Recomendado</Text>}
                <Text style={s.planLabel}>{plan.label}</Text>
                <Text style={s.planPrice}>{plan.price}<Text style={s.planInterval}>{plan.interval}</Text></Text>
                <Text style={s.planHint}>{plan.hint}</Text>
              </TouchableOpacity>
            ))}

            {error ? <Text style={s.error}>{error}</Text> : null}

            <TouchableOpacity style={[s.primaryBtn, !selected && { opacity: 0.5 }]} onPress={startCheckout} disabled={submitting || !selected}>
              {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={s.primaryText}>Ir para Stripe Checkout 🚀</Text>}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={s.secondaryBtn} onPress={() => refreshProfile()} disabled={submitting}>
          <Text style={s.secondaryText}>Já paguei — atualizar acesso</Text>
        </TouchableOpacity>

        {isGestorContext ? (
          <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()} disabled={submitting}>
            <Text style={s.ghostText}>← Voltar ao painel</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.ghostBtn} onPress={() => logout()} disabled={submitting}>
            <Text style={s.ghostText}>Sair da conta</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gradStart },
  content: { padding: 24, paddingTop: Platform.OS === 'ios' ? 64 : 48, paddingBottom: 60, alignItems: 'center' },
  icon: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  title: { fontSize: FontSize.xl, fontWeight: '900', color: Colors.white, textAlign: 'center', marginBottom: 8 },
  desc: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  
  statusCard: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radii.md, padding: 16, width: '100%', marginBottom: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  statusTitle: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  statusIndicator: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: FontSize.sm + 1, fontWeight: '800' },
  statusPeriod: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', marginTop: 8 },

  portalCard: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 18, width: '100%', ...Shadow.md, marginBottom: 12 },
  portalTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginBottom: 6 },
  portalDesc: { fontSize: FontSize.xs + 1, color: Colors.textSecondary, lineHeight: 18, marginBottom: 16 },

  planCard: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 18, marginBottom: 12, borderWidth: 2.5, borderColor: 'transparent', width: '100%', ...Shadow.sm },
  planCardActive: { borderColor: Colors.primary, backgroundColor: '#FAF9FF' },
  badge: { alignSelf: 'flex-start', backgroundColor: Colors.primary, fontSize: 10, fontWeight: '800', color: Colors.white, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radii.full, overflow: 'hidden', marginBottom: 8 },
  planLabel: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  planPrice: { fontSize: 24, fontWeight: '900', color: Colors.primary, marginTop: 4 },
  planInterval: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: 'normal' },
  planHint: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4, lineHeight: 16 },
  error: { color: '#FCA5A5', textAlign: 'center', marginBottom: 12, fontSize: FontSize.sm },
  primaryBtn: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: Radii.full, alignItems: 'center', width: '100%', marginTop: 8, ...Shadow.btn },
  primaryText: { color: Colors.white, fontWeight: '800', fontSize: FontSize.sm },
  secondaryBtn: { marginTop: 18, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.sm },
  ghostBtn: { marginTop: 8, paddingVertical: 12, alignItems: 'center', width: '100%' },
  ghostText: { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.sm, fontWeight: '600' },
});
