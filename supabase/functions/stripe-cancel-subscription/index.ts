// Cancela assinatura Stripe activa para a família do utilizador.
// POST sem body (usa subscription_id em families — deve ser sub_... do Stripe).
//
// Após cancelar, o Stripe envia webhooks; esta função actualiza de imediato.

import { corsHeaders, json } from "../_shared/cors.ts";
import { getStripe } from "../_shared/stripeClient.ts";
import { applyStripeSubscriptionToFamily } from "../_shared/stripeFamilySync.ts";
import { adminClient, userFromAuthHeader } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

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
    if (profile.role !== "parent" && profile.role !== "master") {
      return json({ error: "forbidden" }, 403);
    }

    const { data: fam } = await sb
      .from("families")
      .select("subscription_id, gestor_user_id")
      .eq("id", profile.family_id)
      .single();

    const profileAp = profile.access_profile ?? "gestor";
    if (profile.role === "parent") {
      if (profileAp !== "gestor") {
        return json({ error: "only_gestor_can_manage" }, 403);
      }
      const gid = fam?.gestor_user_id;
      if (gid != null && gid !== user.id) {
        return json({ error: "only_family_billing_gestor" }, 403);
      }
    }
    if (!fam) return json({ error: "family_not_found" }, 400);

    const subId = fam.subscription_id;
    if (!subId || !String(subId).startsWith("sub_")) {
      return json({ error: "no_stripe_subscription" }, 400);
    }

    const stripe = getStripe();
    const active = await stripe.subscriptions.retrieve(subId);
    if (active.metadata?.family_id !== profile.family_id) {
      return json({ error: "subscription_not_owned" }, 403);
    }

    await stripe.subscriptions.cancel(subId);
    const cancelled = await stripe.subscriptions.retrieve(subId);
    await applyStripeSubscriptionToFamily(
      sb,
      profile.family_id,
      cancelled,
      active.metadata?.plan_code ?? null,
    );

    return json({ ok: true, status: cancelled.status });
  } catch (e) {
    console.error("[stripe-cancel-subscription]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
