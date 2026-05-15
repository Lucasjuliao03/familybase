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
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await userFromAuthHeader(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const plan_code = body?.plan_code as string | undefined;
    const card_token_id = body?.card_token_id as string | undefined;
    const payer_email = body?.payer_email as string | undefined;

    if (!plan_code || !card_token_id) {
      return json({ error: "missing_params", required: ["plan_code", "card_token_id"] }, 400);
    }

    const sb = adminClient();
    const { data: profile, error: profErr } = await sb
      .from("users")
      .select("id, family_id, email, role, access_profile")
      .eq("id", user.id)
      .single();
    if (profErr || !profile?.family_id) return json({ error: "no_family" }, 400);
    if (profile.role !== "parent" && profile.role !== "master") {
      return json({ error: "only_parents_can_subscribe" }, 403);
    }

    const { data: family, error: famErr } = await sb
      .from("families")
      .select("id, gestor_user_id")
      .eq("id", profile.family_id)
      .single();
    if (famErr || !family) return json({ error: "family_not_found" }, 400);

    const profileAp = profile.access_profile ?? "gestor";
    if (profile.role === "parent") {
      if (profileAp !== "gestor") {
        return json({ error: "only_gestor_can_subscribe" }, 403);
      }
      const gid = family.gestor_user_id;
      if (gid != null && gid !== user.id) {
        return json({ error: "only_family_billing_gestor" }, 403);
      }
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
    const start = new Date(Date.now() + 120_000);
    const end = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);

    let subscription: Awaited<ReturnType<typeof mpCreateSubscription>>;
    try {
      subscription = await mpCreateSubscription({
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
    } catch (mpErr: unknown) {
      const m = mpErr as { message?: string; body?: unknown };
      console.error("[mp-create-subscription] Mercado Pago:", m?.message, JSON.stringify(m?.body ?? ""));
      return json({
        error: "mercadopago_failed",
        message: String(m?.message || mpErr),
        detail: m?.body ?? null,
      }, 502);
    }

    try {
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

      await sb.from("payment_events").insert({
        family_id: profile.family_id,
        user_id: user.id,
        gateway: "mercadopago",
        event_type: "create_subscription_attempt",
        event_id: subscription?.id || null,
        payload: subscription as unknown as Record<string, unknown>,
        processed: true,
      }).catch(() => {/* tabela opcional até migrar DB */});

      console.log(
        `[mp-create-subscription] ok family=${profile.family_id} mp_status=${subscription?.status} plan=${plan_code}`,
      );
    } catch (dbErr: unknown) {
      console.error("[mp-create-subscription] DB após MP:", dbErr);
      return json({
        error: "db_update_failed",
        message: String((dbErr as Error)?.message || dbErr),
        mp_subscription: subscription,
      }, 500);
    }

    return json({ ok: true, subscription, status: subscription?.status });
  } catch (e) {
    console.error("[mp-create-subscription] fatal:", e);
    return json({ error: String((e as Error)?.message || e), detail: (e as { body?: unknown })?.body }, 500);
  }
});
