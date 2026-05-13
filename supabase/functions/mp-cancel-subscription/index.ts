import { corsHeaders, json } from "../_shared/cors.ts";
import { mpCancelPreapproval } from "../_shared/mercadopago.ts";
import { adminClient, userFromAuthHeader } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await userFromAuthHeader(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    const sb = adminClient();
    const { data: profile } = await sb
      .from("users")
      .select("family_id, role")
      .eq("id", user.id)
      .single();
    if (!profile?.family_id) return json({ error: "no_family" }, 400);
    if (profile.role !== "parent" && profile.role !== "master") {
      return json({ error: "forbidden" }, 403);
    }

    const { data: fam } = await sb.from("families").select("subscription_id").eq("id", profile.family_id).single();
    if (!fam?.subscription_id) return json({ error: "no_subscription" }, 400);

    const result = await mpCancelPreapproval(fam.subscription_id);

    await sb.from("families").update({
      subscription_status: "cancelled",
      status: "trial",
    }).eq("id", profile.family_id);

    await sb.from("subscription_events").insert({
      family_id: profile.family_id,
      event_type: "cancelled",
      subscription_id: fam.subscription_id,
      payload: result,
    });

    return json({ ok: true, result });
  } catch (e) {
    return json({ error: String(e?.message || e), detail: (e as any)?.body }, 500);
  }
});
