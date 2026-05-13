// Helpers para chamar a API REST do Mercado Pago.
// Docs:
//   https://www.mercadopago.com.br/developers/pt/reference/subscriptions/_preapproval_plan/post
//   https://www.mercadopago.com.br/developers/pt/reference/subscriptions/_preapproval/post

const MP_BASE = "https://api.mercadopago.com";

function token() {
  const t = Deno.env.get("MP_ACCESS_TOKEN");
  if (!t) throw new Error("MP_ACCESS_TOKEN não configurado");
  return t;
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${MP_BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const txt = await res.text();
  let body: any = null;
  try { body = txt ? JSON.parse(txt) : null; } catch { body = txt; }
  if (!res.ok) {
    const causes = Array.isArray(body?.cause)
      ? body.cause.map((c: unknown) => (typeof c === "object" && c && "message" in c ? (c as { message: string }).message : String(c))).join("; ")
      : "";
    const msg = body?.message || body?.error || res.statusText || "Mercado Pago error";
    const err = new Error(causes ? `MP ${res.status}: ${msg} (${causes})` : `MP ${res.status}: ${msg}`);
    (err as any).status = res.status;
    (err as any).body = body;
    throw err;
  }
  return body;
}

export interface PlanInput {
  reason: string;
  amount: number;            // ex 19.90
  currency_id?: string;      // ex BRL
  frequency: number;         // 1
  frequency_type: "months" | "days";
  repetitions?: number;      // opcional
  back_url: string;
}

export function mpCreatePlan(input: PlanInput) {
  return call("/preapproval_plan", {
    method: "POST",
    body: JSON.stringify({
      reason: input.reason,
      auto_recurring: {
        frequency: input.frequency,
        frequency_type: input.frequency_type,
        repetitions: input.repetitions,
        transaction_amount: input.amount,
        currency_id: input.currency_id || "BRL",
      },
      payment_methods_allowed: {
        payment_types: [{}],
        payment_methods: [{}],
      },
      back_url: input.back_url,
    }),
  });
}

export interface SubscriptionInput {
  preapproval_plan_id: string;
  payer_email: string;
  card_token_id: string;
  external_reference: string;
  amount: number;
  currency_id?: string;
  back_url: string;
  start_date?: string;
  end_date?: string;
  frequency?: number;
  frequency_type?: "months" | "days";
}

export function mpCreateSubscription(input: SubscriptionInput) {
  return call("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      preapproval_plan_id: input.preapproval_plan_id,
      reason: "Base Familiar - Assinatura",
      external_reference: input.external_reference,
      payer_email: input.payer_email,
      card_token_id: input.card_token_id,
      auto_recurring: {
        frequency: input.frequency ?? 1,
        frequency_type: input.frequency_type ?? "months",
        start_date: input.start_date,
        end_date: input.end_date,
        transaction_amount: input.amount,
        currency_id: input.currency_id || "BRL",
      },
      back_url: input.back_url,
      status: "authorized",
    }),
  });
}

export function mpGetPreapproval(id: string) {
  return call(`/preapproval/${id}`, { method: "GET" });
}

export function mpCancelPreapproval(id: string) {
  return call(`/preapproval/${id}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });
}

export function mpGetPayment(id: string | number) {
  return call(`/v1/payments/${id}`, { method: "GET" });
}
