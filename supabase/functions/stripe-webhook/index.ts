// Webhook Stripe — atualiza estado da família (assinatura, falhas, cancelamento).
//
// Stripe Dashboard → Developers → Webhooks → Add endpoint:
//   URL: https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook
//   Eventos recomendados:
//     checkout.session.completed
//     customer.subscription.updated
//     customer.subscription.deleted
//     invoice.payment_failed
//
// Secret: STRIPE_WEBHOOK_SECRET (signing secret whsec_...)
//
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// (O Stripe não envia JWT do utilizador ao Supabase.)

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { corsHeaders, json } from "../_shared/cors.ts";
import { getStripe } from "../_shared/stripeClient.ts";
import { applyStripeSubscriptionToFamily } from "../_shared/stripeFamilySync.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET em falta");
    return json({ error: "webhook_secret_not_configured" }, 500);
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "missing_stripe_signature" }, 400);

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("[stripe-webhook] assinatura inválida:", err);
    return json({ error: "invalid_signature" }, 400);
  }

  const sb = adminClient();
  const eventId = event.id;

  try {
    const { data: existing } = await sb.from("stripe_webhook_events")
      .select("event_id").eq("event_id", eventId).maybeSingle();
    if (existing) {
      return json({ ok: true, duplicate: true });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const familyId = session.metadata?.family_id;
        const planCode = session.metadata?.plan_code ?? null;
        if (!familyId || session.mode !== "subscription") break;

        const subId = session.subscription;
        if (typeof subId !== "string") break;

        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(subId);
        await applyStripeSubscriptionToFamily(sb, familyId, sub, planCode);

        const cust = session.customer;
        const customerId = typeof cust === "string" ? cust : cust?.id;
        if (customerId) {
          await sb.from("families").update({ stripe_customer_id: customerId }).eq("id", familyId);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const familyId = sub.metadata?.family_id;
        if (!familyId) break;
        await applyStripeSubscriptionToFamily(sb, familyId, sub, sub.metadata?.plan_code ?? null);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const rawSub = invoice.subscription;
        const subId = typeof rawSub === "string" ? rawSub : rawSub?.id;
        if (!subId) break;
        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(subId);
        const familyId = sub.metadata?.family_id;
        if (!familyId) break;
        await applyStripeSubscriptionToFamily(sb, familyId, sub, sub.metadata?.plan_code ?? null);
        break;
      }
      default:
        break;
    }

    await sb.from("stripe_webhook_events").insert({
      event_id: eventId,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

    return json({ received: true });
  } catch (e) {
    console.error("[stripe-webhook]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
