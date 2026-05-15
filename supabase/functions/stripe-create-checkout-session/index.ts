// Abre Stripe Checkout em modo subscription. Resposta: { url } para redirecionar o browser.
// POST { plan_code: "premium_mensal" | "premium_anual" }
//
// Secrets: STRIPE_SECRET_KEY, SITE_URL,
// Opcional lookup keys (prioritário): STRIPE_LOOKUP_KEY_PREMIUM_MENSAL, STRIPE_LOOKUP_KEY_PREMIUM_ANUAL
// Senão ids: STRIPE_PRICE_PREMIUM_MENSAL, STRIPE_PRICE_PREMIUM_ANUAL
// Opcional Stripe Tax: STRIPE_AUTOMATIC_TAX_ENABLED=true (activa também colecta de morada)

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { corsHeaders, json } from "../_shared/cors.ts";
import {
  checkoutAutomaticTaxEnabled,
  getStripe,
  publicSiteUrl,
  resolvePriceIdForPlan,
} from "../_shared/stripeClient.ts";
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
    if (!plan_code || !["premium_mensal", "premium_anual"].includes(plan_code)) {
      return json({ error: "invalid_plan", plan_code }, 400);
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
      .select("id, gestor_user_id, stripe_customer_id")
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

    const stripe = getStripe();
    const site = publicSiteUrl();
    const price = await resolvePriceIdForPlan(plan_code);
    const payerEmail = profile.email || user.email || undefined;
    const useTax = checkoutAutomaticTaxEnabled();

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      client_reference_id: family.id,
      line_items: [{ price, quantity: 1 }],
      success_url:
        `${site}/subscribe?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/subscribe?checkout=cancelled`,
      locale: "pt-BR",
      metadata: {
        family_id: family.id,
        plan_code,
      },
      subscription_data: {
        metadata: {
          family_id: family.id,
          plan_code,
        },
      },
    };

    if (family.stripe_customer_id) {
      sessionParams.customer = family.stripe_customer_id;
      if (useTax) {
        sessionParams.customer_update = { address: "auto", shipping: "auto" };
      }
    } else if (payerEmail) {
      sessionParams.customer_email = payerEmail;
    }

    if (useTax) {
      sessionParams.automatic_tax = { enabled: true };
      sessionParams.tax_id_collection = { enabled: true };
      sessionParams.billing_address_collection = "required";
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      return json({ error: "stripe_no_url", session_id: session.id }, 502);
    }

    return json({ url: session.url, session_id: session.id });
  } catch (e) {
    console.error("[stripe-create-checkout-session]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
