// Abre Stripe Checkout em modo subscription. Resposta: { url } para redirecionar o browser.
// ⚠️ CORS/preflight: em supabase/config.toml esta função tem verify_jwt = false para o OPTIONS
//    passar sem token; o POST continua a exigir Authorization (validado em userFromAuthHeader).
// POST { plan_code: "premium_mensal" | "premium_anual" }
//
// Secrets: STRIPE_SECRET_KEY, SITE_URL,
// Opcional lookup keys (prioritário): STRIPE_LOOKUP_KEY_PREMIUM_MENSAL, STRIPE_LOOKUP_KEY_PREMIUM_ANUAL
// Senão ids: STRIPE_PRICE_PREMIUM_MENSAL, STRIPE_PRICE_PREMIUM_ANUAL
// Opcional Stripe Tax: STRIPE_AUTOMATIC_TAX_ENABLED=true (activa também colecta de morada)

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { corsPreflightResponse, json } from "../_shared/cors.ts";
import {
  checkoutAutomaticTaxEnabled,
  getStripe,
  publicSiteUrl,
  resolvePriceIdForPlan,
} from "../_shared/stripeClient.ts";
import { adminClient, userFromAuthHeader } from "../_shared/supabaseAdmin.ts";

/** Mensagem Stripe (Node/Deno) para diagnóstico no browser. */
function errMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

/** Customer id na BD pode ser outra conta Stripe ou ter sido apagado — repetir só com email. */
function stripeCustomerMissingOrInvalid(e: unknown): boolean {
  const m = errMessage(e).toLowerCase();
  const code =
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code?: string }).code === "string"
      ? (e as { code?: string }).code
      : "";
  return (
    code === "resource_missing" ||
    m.includes("no such customer") ||
    m.includes("customer was deleted") ||
    m.includes("the customer specified does not exist")
  );
}
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

    const plan_code = body?.plan_code as string | undefined;
    if (!plan_code || !["premium_mensal", "premium_anual"].includes(plan_code)) {
      return json({ error: "invalid_plan", plan_code }, 400);
    }

    type FamilyRow = {
      id: string;
      gestor_user_id: string | null;
      stripe_customer_id?: string | null;
    };

    const sb = adminClient();
    // Duas queries directas evitam relação ambígua users↔families (membership vs gestor).
    const { data: profile, error: profErr } = await sb
      .from("users")
      .select("id, family_id, email, role, access_profile")
      .eq("id", user.id)
      .maybeSingle();

    if (profErr) {
      console.error("[stripe-create-checkout-session] profile_error", profErr);
      return json({ error: "profile_load_failed" }, 502);
    }
    if (!profile) {
      return json(
        {
          error: "profile_not_found",
          hint_pt:
            "A sessão é válida, mas não há linha em public.users para o id do JWT (sub). Confirma que o frontend usa o mesmo projecto Supabase que as Edge Functions e que existe public.users.id igual a auth.uid. Compara debug.auth_user_id com o user_id obtido por email no SQL Editor.",
          debug: { auth_user_id: user.id },
        },
        400,
      );
    }
    if (!profile.family_id) {
      return json(
        {
          error: "no_family",
          hint_pt:
            "public.users.family_id está vazio para este utilizador. Liga o utilizador a uma família (onboarding/admin) e tenta novamente.",
          debug: { auth_user_id: user.id },
        },
        400,
      );
    }
    if (profile.role !== "parent" && profile.role !== "master") {
      return json({ error: "only_parents_can_subscribe" }, 403);
    }

    const fid =
      typeof profile.family_id === "string"
        ? profile.family_id.trim()
        : String(profile.family_id);

    // `*` evita erro 42703 se a migração `stripe_billing.sql` (stripe_customer_id) ainda não correu na BD.
    const { data: famRow, error: famErr } = await sb
      .from("families")
      .select("*")
      .eq("id", fid)
      .maybeSingle();

    if (famErr) {
      console.error("[stripe-create-checkout-session] family_query_error", famErr);
      return json(
        {
          error: "family_query_failed",
          hint_pt:
            "Erro ao ler public.families (ver Logs da função). Confirma que as migrações da app estão aplicadas no mesmo projecto Supabase.",
          debug: { auth_user_id: user.id, users_family_id: fid },
        },
        502,
      );
    }

    const family = famRow as FamilyRow | null;
    if (!family?.id) {
      return json(
        {
          error: "family_not_found",
          hint_pt:
            "Este utilizador tem users.family_id mas não há linha em public.families com esse id (dados inconsistentes ou projecto BD errado). Executa supabase/diagnostico_usuario_familia.sql.",
          debug: { auth_user_id: user.id, users_family_id: fid },
        },
        400,
      );
    }

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

    let session: Stripe.Response<Stripe.Checkout.Session>;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (first: unknown) {
      if (
        stripeCustomerMissingOrInvalid(first) &&
        sessionParams.customer &&
        payerEmail
      ) {
        console.warn(
          "[stripe-create-checkout-session] customer_inválido_na_bd, retentar com email:",
          errMessage(first),
        );
        const retry: Stripe.Checkout.SessionCreateParams = { ...sessionParams };
        delete retry.customer;
        delete retry.customer_update;
        retry.customer_email = payerEmail;
        session = await stripe.checkout.sessions.create(retry);
      } else {
        throw first;
      }
    }

    if (!session.url) {
      return json({ error: "stripe_no_url", session_id: session.id }, 502);
    }

    return json({ url: session.url, session_id: session.id });
  } catch (e) {
    console.error("[stripe-create-checkout-session]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
