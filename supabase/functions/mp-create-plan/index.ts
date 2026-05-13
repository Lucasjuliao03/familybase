// Cria os planos no Mercado Pago e guarda os IDs.
// Executar uma vez por ambiente (test/prod). Apenas o "master" deveria chamar.
//
// POST sem body → cria mensal R$ 19,90 e anual R$ 199,00 (configuráveis via env).
//
// Variáveis de ambiente esperadas:
//   MP_ACCESS_TOKEN
//   MP_BACK_URL                (ex: https://seu-dominio.com/subscribe/return)
//   MP_PLAN_MENSAL_AMOUNT      (default 19.90)
//   MP_PLAN_ANUAL_AMOUNT       (default 199.00)
//
// Resposta: { ok: true, plans: { mensal: { id, amount }, anual: { id, amount } } }

import { corsHeaders, json } from "../_shared/cors.ts";
import { mpCreatePlan } from "../_shared/mercadopago.ts";
import { adminClient, userFromAuthHeader } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await userFromAuthHeader(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    const sb = adminClient();
    const { data: row } = await sb.from("users").select("role").eq("id", user.id).single();
    if (row?.role !== "master" && row?.role !== "parent") {
      return json({ error: "forbidden" }, 403);
    }

    const backUrl = Deno.env.get("MP_BACK_URL") || "https://example.com/subscribe/return";
    const mensalAmount = Number(Deno.env.get("MP_PLAN_MENSAL_AMOUNT") || "19.90");
    const anualAmount  = Number(Deno.env.get("MP_PLAN_ANUAL_AMOUNT")  || "199.00");

    const mensal = await mpCreatePlan({
      reason: "Base Familiar - Plano Mensal",
      amount: mensalAmount,
      currency_id: "BRL",
      frequency: 1,
      frequency_type: "months",
      back_url: backUrl,
    });

    const anual = await mpCreatePlan({
      reason: "Base Familiar - Plano Anual",
      amount: anualAmount,
      currency_id: "BRL",
      frequency: 12,
      frequency_type: "months",
      back_url: backUrl,
    });

    // Persistir em mp_plans
    await sb.from("mp_plans").upsert([
      { code: "premium_mensal", mp_plan_id: mensal.id, amount: mensalAmount, currency: "BRL", label: "Mensal" },
      { code: "premium_anual",  mp_plan_id: anual.id,  amount: anualAmount,  currency: "BRL", label: "Anual"  },
    ], { onConflict: "code" });

    return json({
      ok: true,
      plans: {
        mensal: { id: mensal.id, amount: mensalAmount },
        anual:  { id: anual.id,  amount: anualAmount  },
      },
    });
  } catch (e) {
    return json({ error: String(e?.message || e), detail: (e as any)?.body }, 500);
  }
});
