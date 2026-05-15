// Resumo Stripe para o gestor — só leitura (renovação, cancelamento agendado, plano).
// GET ou POST sem body — JWT obrigatório.

import { corsHeaders, json } from "../_shared/cors.ts";
import { getStripe } from "../_shared/stripeClient.ts";
import { adminClient, userFromAuthHeader } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await userFromAuthHeader(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    const sb = adminClient();
    const { data: profile } = await sb
      .from("users")
      .select("family_id, role, access_profile")
      .eq("id", user.id)
      .single();
    if (!profile?.family_id) return json({ error: "no_family" }, 400);

    const { data: fam } = await sb
      .from("families")
      .select(
        "subscription_id, subscription_status, plan_id, stripe_customer_id, gestor_user_id",
      )
      .eq("id", profile.family_id)
      .single();
    if (!fam) return json({ error: "family_not_found" }, 400);

    if (profile.role === "parent") {
      if ((profile.access_profile ?? "gestor") !== "gestor") {
        return json({ error: "only_gestor" }, 403);
      }
      const gid = fam.gestor_user_id;
      if (gid != null && gid !== user.id) {
        return json({ error: "only_family_billing_gestor" }, 403);
      }
    }

    const subId = fam.subscription_id;

    if (!subId || !String(subId).startsWith("sub_")) {
      return json({
        has_stripe_subscription: false,
        family_status: {
          subscription_status: fam.subscription_status,
          plan_id: fam.plan_id,
          stripe_customer_id: fam.stripe_customer_id,
        },
      });
    }

    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(subId, {
      expand: ["items.data.price.product"],
    });

    const item = sub.items.data[0];
    const price = item?.price;
    const interval = price?.recurring?.interval ?? null;
    const amount = typeof price?.unit_amount === "number"
      ? price.unit_amount / 100
      : null;
    const currency = price?.currency?.toUpperCase() ?? "BRL";

    return json({
      has_stripe_subscription: true,
      subscription_id: sub.id,
      status: sub.status,
      plan_code: sub.metadata?.plan_code ?? fam.plan_id,
      cancel_at_period_end: sub.cancel_at_period_end,
      current_period_end: sub.current_period_end,
      amount,
      currency,
      interval,
      family_status: {
        subscription_status: fam.subscription_status,
        plan_id: fam.plan_id,
        stripe_customer_id: fam.stripe_customer_id,
      },
    });
  } catch (e) {
    console.error("[stripe-get-billing-summary]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
