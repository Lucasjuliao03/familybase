// Webhook do Mercado Pago para eventos de pagamento e assinatura.
//
// Configurar em: Mercado Pago > Suas integrações > Webhooks
//   URL: https://<PROJECT-REF>.supabase.co/functions/v1/mp-webhook
//   Tópicos: payment, subscription_preapproval, subscription_authorized_payment
//
// Assinatura: o MP envia x-signature (HMAC-SHA256) calculado sobre
//   id:<data.id>;request-id:<x-request-id>;ts:<timestamp>
// usando o "Segredo" gerado em "Suas integrações > Sua aplicação > Webhooks".
// Coloque o segredo em MP_WEBHOOK_SECRET. Se vazio, validação é ignorada
// (apenas para testes locais — NÃO use em produção).
//
// Idempotência: guardamos cada (event_id) em mp_webhook_events.

import { corsHeaders, json } from "../_shared/cors.ts";
import { mpGetPreapproval, mpGetPayment } from "../_shared/mercadopago.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("MP_WEBHOOK_SECRET");
  if (!secret) return true; // dev mode

  const sigHeader = req.headers.get("x-signature") || "";
  const reqId = req.headers.get("x-request-id") || "";

  // x-signature vem como "ts=<TS>,v1=<HASH>"
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => {
    const i = kv.indexOf("=");
    return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
  }));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  // dataId fica em query string "data.id"
  const url = new URL(req.url);
  const dataId = url.searchParams.get("data.id") || (() => {
    try { return JSON.parse(rawBody)?.data?.id || ""; } catch { return ""; }
  })();

  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(manifest));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");

  return hex === v1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = adminClient();
  const rawBody = await req.text();

  try {
    const ok = await verifySignature(req, rawBody);
    if (!ok) return json({ error: "invalid_signature" }, 401);

    const payload = rawBody ? JSON.parse(rawBody) : {};
    const type = payload?.type || payload?.topic || "";
    const dataId = String(payload?.data?.id || "");
    const eventId = String(payload?.id || `${type}:${dataId}:${Date.now()}`);

    // Idempotência
    const { data: existing } = await sb.from("mp_webhook_events").select("event_id").eq("event_id", eventId).maybeSingle();
    if (existing) return json({ ok: true, duplicate: true });

    await sb.from("mp_webhook_events").insert({ event_id: eventId, type, payload });

    // Processar consoante o tópico
    if (type === "subscription_preapproval" || type === "preapproval") {
      const preapp = await mpGetPreapproval(dataId);
      const externalRef = preapp?.external_reference || "";
      const familyId = externalRef.startsWith("family:") ? externalRef.slice(7) : null;
      if (familyId) {
        const status = preapp?.status;
        let subStatus = "trial";
        if (status === "authorized") subStatus = "active";
        else if (status === "paused" || status === "past_due") subStatus = "past_due";
        else if (status === "cancelled") subStatus = "cancelled";

        await sb.from("families").update({
          subscription_status: subStatus,
          subscription_id: preapp?.id,
          status: subStatus === "active" ? "active" : "trial",
        }).eq("id", familyId);

        await sb.from("subscription_events").insert({
          family_id: familyId,
          event_type: `preapproval_${status}`,
          subscription_id: preapp?.id,
          payload: preapp,
        });
      }
    } else if (type === "payment") {
      const payment = await mpGetPayment(dataId);
      const externalRef = payment?.external_reference || payment?.metadata?.external_reference || "";
      const familyId = externalRef.startsWith("family:") ? externalRef.slice(7) : null;
      if (familyId) {
        await sb.from("subscription_events").insert({
          family_id: familyId,
          event_type: `payment_${payment?.status || "unknown"}`,
          subscription_id: payment?.id ? String(payment.id) : null,
          amount: payment?.transaction_amount || null,
          payload: payment,
        });

        // Se aprovado → manter active
        if (payment?.status === "approved") {
          await sb.from("families").update({
            subscription_status: "active",
            status: "active",
          }).eq("id", familyId);
        }
        // Se recusado → past_due (lógica MP de retry decide)
        if (payment?.status === "rejected") {
          await sb.from("families").update({
            subscription_status: "past_due",
          }).eq("id", familyId);
        }
      }
    }

    return json({ ok: true });
  } catch (e) {
    console.error("mp-webhook error", e);
    return json({ error: String(e?.message || e) }, 500);
  }
});
