// Confirma o Checkout após redirect (enquanto o webhook pode ainda estar a chegar).
// POST { session_id: string }
//
// Valida que a sessão pertence à família do utilizador e sincroniza `families`.

import { corsPreflightResponse, json } from "../_shared/cors.ts";
import { getStripe } from "../_shared/stripeClient.ts";
import { applyStripeSubscriptionToFamily } from "../_shared/stripeFamilySync.ts";
import { adminClient, userFromAuthHeader } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
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

    const session_id = body?.session_id as string | undefined;
    if (!session_id) return json({ error: "missing_session_id" }, 400);

    const sb = adminClient();
    const { data: profile } = await sb
      .from("users")
      .select("family_id")
      .eq("id", user.id)
      .single();
    if (!profile?.family_id) return json({ error: "no_family" }, 400);

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription"],
    });

    if (session.metadata?.family_id !== profile.family_id) {
      return json({ error: "session_family_mismatch" }, 403);
    }

    if (session.mode !== "subscription") {
      return json({ error: "not_subscription_checkout" }, 400);
    }

    if (session.payment_status !== "paid") {
      return json({ error: "payment_not_complete", status: session.payment_status }, 400);
    }

    const subObj = session.subscription;
    if (!subObj || typeof subObj === "string") {
      return json({ error: "subscription_not_expanded" }, 502);
    }

    const planCode = session.metadata?.plan_code ?? null;

    await applyStripeSubscriptionToFamily(sb, profile.family_id, subObj, planCode);

    const customerId = typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
    if (customerId) {
      await sb.from("families").update({ stripe_customer_id: customerId })
        .eq("id", profile.family_id);
    }

    return json({ ok: true, subscription_status: subObj.status });
  } catch (e) {
    console.error("[stripe-sync-checkout-session]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
