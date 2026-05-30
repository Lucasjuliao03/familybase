-- RPC para gestor alterar e-mail de membro/filho (auth.users + public.users + identities).
-- Fallback quando a Edge Function update-family-member-email não estiver publicada.

CREATE OR REPLACE FUNCTION public.change_member_email(
  p_target_user_id uuid,
  p_new_email        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_caller_uid uuid;
  v_caller_fid uuid;
  v_target_fid uuid;
  v_normalized text;
  v_rows       integer;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_normalized := lower(trim(p_new_email));
  IF v_normalized = '' OR v_normalized !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  SELECT family_id INTO v_caller_fid FROM public.users WHERE id = v_caller_uid;
  IF v_caller_fid IS NULL THEN
    RAISE EXCEPTION 'not_in_family';
  END IF;

  SELECT family_id INTO v_target_fid FROM public.users WHERE id = p_target_user_id;
  IF v_target_fid IS DISTINCT FROM v_caller_fid THEN
    RAISE EXCEPTION 'family_mismatch: o utilizador alvo não pertence à sua família';
  END IF;

  IF p_target_user_id IS DISTINCT FROM v_caller_uid THEN
    IF NOT public.user_is_family_gestor(v_caller_uid) THEN
      RAISE EXCEPTION 'permission_denied: apenas o gestor pode alterar o e-mail de outros membros';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users au
    WHERE lower(au.email) = v_normalized AND au.id <> p_target_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE lower(u.email) = v_normalized AND u.id <> p_target_user_id
  ) THEN
    RAISE EXCEPTION 'email_already_in_use';
  END IF;

  UPDATE auth.users
  SET email = v_normalized,
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = p_target_user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'auth_user_not_found: conta de login não encontrada';
  END IF;

  UPDATE auth.identities
  SET identity_data = identity_data || jsonb_build_object('email', v_normalized, 'email_verified', true),
      updated_at = now()
  WHERE user_id = p_target_user_id
    AND provider = 'email';

  UPDATE public.users
  SET email = v_normalized,
      updated_at = now()
  WHERE id = p_target_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.change_member_email(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_member_email(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_member_email(uuid, text) TO service_role;
