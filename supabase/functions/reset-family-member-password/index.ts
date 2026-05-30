// Gestor redefine senha de filho ou membro da família via Auth Admin API (confiável para login).
import { corsPreflightResponse, json } from "../_shared/cors.ts";
import { adminClient, userFromAuthHeader } from "../_shared/supabaseAdmin.ts";

function isFamilyGestor(
  role: string,
  accessProfile: string | null | undefined,
  callerId: string,
  gestorUserId: string | null | undefined,
): boolean {
  if (role === "master") return true;
  if (role !== "parent") return false;
  const ap = (accessProfile ?? "gestor").trim().toLowerCase();
  if (ap === "gestor") return true;
  return gestorUserId != null && gestorUserId === callerId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await userFromAuthHeader(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const newPassword = String(body.new_password ?? "").trim();
    const mustChange = !!body.must_change_password;
    let targetUserId = body.target_user_id ? String(body.target_user_id) : "";

    if (newPassword.length < 4) {
      return json({ error: "password_too_short: mínimo 4 caracteres" }, 400);
    }

    const sb = adminClient();
    const { data: profile, error: profErr } = await sb
      .from("users")
      .select("family_id, role, access_profile")
      .eq("id", user.id)
      .single();
    if (profErr || !profile?.family_id) return json({ error: "no_family" }, 400);

    const { data: fam } = await sb
      .from("families")
      .select("gestor_user_id")
      .eq("id", profile.family_id)
      .single();

    if (!isFamilyGestor(profile.role, profile.access_profile, user.id, fam?.gestor_user_id)) {
      return json({ error: "only_gestor_can_reset_password" }, 403);
    }

    if (body.child_id) {
      const childId = String(body.child_id);
      const { data: ch } = await sb
        .from("children")
        .select("user_id, family_id")
        .eq("id", childId)
        .maybeSingle();
      if (!ch?.user_id || ch.family_id !== profile.family_id) {
        return json({ error: "child_not_found_or_no_login" }, 404);
      }
      targetUserId = ch.user_id;
    }

    if (!targetUserId) return json({ error: "target_required" }, 400);

    const { data: target } = await sb
      .from("users")
      .select("id, family_id")
      .eq("id", targetUserId)
      .maybeSingle();
    if (!target || target.family_id !== profile.family_id) {
      return json({ error: "family_mismatch" }, 403);
    }

    const { error: authErr } = await sb.auth.admin.updateUserById(targetUserId, {
      password: newPassword,
      email_confirm: true,
    });
    if (authErr) return json({ error: authErr.message }, 400);

    await sb
      .from("users")
      .update({
        must_change_password: mustChange,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetUserId);

    return json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
