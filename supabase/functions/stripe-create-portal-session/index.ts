// Customer Billing Portal — gerir método de pagamento / facturas no Stripe.
// POST { return_url?: string }  (default: SITE_URL/parent com JWT válido)

import { corsHeaders, json } from "../_shared/cors.ts";
import { getStripe, publicSiteUrl } from "../_shared/stripeClient.ts";
import { adminClient, userFromAuthHeader } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await userFromAuthHeader(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    let body: Record<string, unknown> = {};
    try {
      if (req.headers.get("content-type")?.includes("application/json")) {
        body = (await req.json()) as Record<string, unknown>;
      }
    } catch {/* vazio OK */}

    const site = publicSiteUrl();
    const candidate =
      typeof body?.return_url === "string" && body.return_url.trim().startsWith("http")
        ? body.return_url.trim().replace(/\/$/, "")
        : "";
    const allowed =
      candidate && (candidate === site || candidate.startsWith(`${site}/`));
    const requestedReturn = allowed ? candidate : `${site}/parent`;

    const sb = adminClient();
    const { data: profile } = await sb
      .from("users")
      .select("id, family_id, role, access_profile")
      .eq("id", user.id)
      .single();
    if (!profile?.family_id) return json({ error: "no_family" }, 400);
    if (profile.role !== "parent" && profile.role !== "master") {
      return json({ error: "forbidden" }, 403);
    }

    const { data: family } = await sb
      .from("families")
      .select("id, gestor_user_id, stripe_customer_id")
      .eq("id", profile.family_id)
      .single();
    if (!family) return json({ error: "family_not_found" }, 400);

    const profileAp = profile.access_profile ?? "gestor";
    if (profile.role === "parent") {
      if (profileAp !== "gestor") {
        return json({ error: "only_gestor_can_manage" }, 403);
      }
      const gid = family.gestor_user_id;
      if (gid != null && gid !== user.id) {
        return json({ error: "only_family_billing_gestor" }, 403);
      }
    }

    const customerId = family.stripe_customer_id;
    if (!customerId?.startsWith("cus_")) {
      return json({ error: "no_stripe_customer" }, 400);
    }

    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: requestedReturn,
    });

    if (!portal.url) {
      return json({ error: "stripe_no_portal_url" }, 502);
    }
    return json({ url: portal.url });
  } catch (e) {
    console.error("[stripe-create-portal-session]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
