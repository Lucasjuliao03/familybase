// Cria uma assinatura recorrente no Mercado Pago para a família do utilizador autenticado.
//
// POST { plan_code: 'premium_mensal' | 'premium_anual', card_token_id: string, payer_email?: string }
//
// Pré-requisitos:
//  - mp-create-plan já correu e existem linhas em mp_plans
//  - O frontend gera card_token_id com MP Bricks/SDK e envia-o aqui
//
// Resposta: { ok: true, subscription: {...}, status }

import { corsHeaders, json } from "../_shared/cors.ts";
import { mpCreateSubscription } from "../_shared/mercadopago.ts";
import { adminClient, userFromAuthHeader } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await userFromAuthHeader(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    const sb = adminClient();
    const { plan_code, card_token_id, payer_email } = await req.json();

    if (!plan_code || !card_token_id) {
      return json({ error: "missing_params", required: ["plan_code", "card_token_id"] }, 400);
    }

    const { data: profile, error: profErr } = await sb
      .from("users")
      .select("id, family_id, email, role")
      .eq("id", user.id)
      .single();
    if (profErr || !profile?.family_id) return json({ error: "no_family" }, 400);
    if (profile.role !== "parent" && profile.role !== "master") {
      return json({ error: "only_parents_can_subscribe" }, 403);
    }

    const { data: plan, error: planErr } = await sb
      .from("mp_plans")
      .select("*")
      .eq("code", plan_code)
      .single();
    if (planErr || !plan?.mp_plan_id) {
      return json({ error: "plan_not_found", hint: "Rode mp-create-plan antes" }, 400);
    }

    const backUrl = Deno.env.get("MP_BACK_URL") || "https://example.com/subscribe/return";
    // MP exige start_date/end_date em auto_recurring (JSON.stringify omitiria undefined → pedido inválido)
    const start = new Date(Date.now() + 120_000);
    const end = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
    const subscription = await mpCreateSubscription({
      preapproval_plan_id: plan.mp_plan_id,
      payer_email: payer_email || profile.email || user.email!,
      card_token_id,
      external_reference: `family:${profile.family_id}`,
      amount: Number(plan.amount),
      currency_id: plan.currency || "BRL",
      back_url: backUrl,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      frequency: plan_code === "premium_anual" ? 12 : 1,
      frequency_type: "months",
    });

    // Guardar referência da assinatura (status="authorized" -> ativa de imediato)
    await sb.from("families").update({
      subscription_status: subscription?.status === "authorized" ? "active" : "past_due",
      subscription_id: subscription?.id || null,
      plan_id: plan.code,
      plan: "premium",
      status: subscription?.status === "authorized" ? "active" : "trial",
    }).eq("id", profile.family_id);

    await sb.from("subscription_events").insert({
      family_id: profile.family_id,
      event_type: "subscribed",
      subscription_id: subscription?.id || null,
      amount: plan.amount,
      payload: subscription,
    });

    return json({ ok: true, subscription, status: subscription?.status });
  } catch (e) {
    return json({ error: String(e?.message || e), detail: (e as any)?.body }, 500);
  }
});
