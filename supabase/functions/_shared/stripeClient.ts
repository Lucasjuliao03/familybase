import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

let instance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!instance) {
    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) throw new Error("STRIPE_SECRET_KEY não configurado");
    instance = new Stripe(key, { apiVersion: "2023-10-16" });
  }
  return instance;
}

/**
 * Resolve o Price id:
 * - Se definires STRIPE_LOOKUP_KEY_PREMIUM_MENSAL ou …_ANUAL (como na amostra Stripe com lookup_keys),
 *   usa a API Stripe para encontrar o `price_*`.
 * - Senão usa STRIPE_PRICE_PREMIUM_MENSAL / STRIPE_PRICE_PREMIUM_ANUAL (ids directos).
 */
export async function resolvePriceIdForPlan(planCode: string): Promise<string> {
  const lookupEnvName = planCode === "premium_anual"
    ? "STRIPE_LOOKUP_KEY_PREMIUM_ANUAL"
    : "STRIPE_LOOKUP_KEY_PREMIUM_MENSAL";
  const priceEnvName = planCode === "premium_anual"
    ? "STRIPE_PRICE_PREMIUM_ANUAL"
    : "STRIPE_PRICE_PREMIUM_MENSAL";

  const lookupKey = Deno.env.get(lookupEnvName)?.trim();
  if (lookupKey) {
    const stripe = getStripe();
    const { data } = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
      limit: 5,
    });
    const match = data.find((p) => (p.lookup_key ?? "") === lookupKey) ?? data[0];
    if (!match?.id) {
      throw new Error(
        `Nenhum preço Stripe encontrado para lookup_key "${lookupKey}" (${lookupEnvName}).`,
      );
    }
    return match.id;
  }

  const id = Deno.env.get(priceEnvName)?.trim();
  if (!id) {
    throw new Error(
      `Define ${lookupEnvName} ou ${priceEnvName} nos Secrets Supabase.`,
    );
  }
  return id;
}

/** Se "true", o Checkout cobra/recolhe dados para impostos (Stripe Tax). */
export function checkoutAutomaticTaxEnabled(): boolean {
  return Deno.env.get("STRIPE_AUTOMATIC_TAX_ENABLED")?.toLowerCase() === "true";
}

export function publicSiteUrl(): string {
  const raw = Deno.env.get("SITE_URL")?.trim();
  if (!raw) {
    throw new Error(
      "SITE_URL não configurado (ex: https://sua-app.vercel.app — sem barra no fim)",
    );
  }
  return raw.replace(/\/$/, "");
}
