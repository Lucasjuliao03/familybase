import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import type Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

export function mapStripeSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): {
  subscription_status: string;
  family_status: string;
} {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return { subscription_status: "active", family_status: "active" };
    case "past_due":
      return { subscription_status: "past_due", family_status: "trial" };
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return { subscription_status: "cancelled", family_status: "trial" };
    case "incomplete":
    case "paused":
    default:
      return { subscription_status: "trial", family_status: "trial" };
  }
}

/** Atualiza `families` + registo em `subscription_events` (idempotente em termos de estado). */
export async function applyStripeSubscriptionToFamily(
  sb: SupabaseClient,
  familyId: string,
  sub: Stripe.Subscription,
  planCodeHint: string | null,
) {
  const planCode = sub.metadata?.plan_code || planCodeHint;
  const { subscription_status, family_status } = mapStripeSubscriptionStatus(sub.status);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

  const patch: Record<string, unknown> = {
    subscription_id: sub.id,
    subscription_status,
    status: family_status,
  };

  if (customerId) patch.stripe_customer_id = customerId;
  if (planCode) patch.plan_id = planCode;

  if (subscription_status === "active") {
    patch.plan = "premium";
  } else if (subscription_status === "past_due") {
    patch.plan = "premium";
  } else if (subscription_status === "cancelled") {
    patch.plan = "free";
  }

  await sb.from("families").update(patch).eq("id", familyId);

  await sb.from("subscription_events").insert({
    family_id: familyId,
    event_type: `stripe_subscription_${sub.status}`,
    subscription_id: sub.id,
    payload: sub as unknown as Record<string, unknown>,
  });

  await sb.from("payment_events").insert({
    family_id: familyId,
    gateway: "stripe",
    event_type: `subscription_${sub.status}`,
    event_id: sub.id,
    payload: { subscription_id: sub.id, status: sub.status },
    processed: true,
  }).catch(() => {/* tabela opcional */});
}
