-- Remove overload antigo (ambíguo) e reforça RPC de senha com confirmação de e-mail.

DROP FUNCTION IF EXISTS public.change_member_password(uuid, text);

CREATE OR REPLACE FUNCTION public.change_member_password(
  p_target_user_id uuid,
  p_new_password   text,
  p_must_change_password boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_fid  uuid;
  v_target_fid  uuid;
  v_rows        integer;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
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
      RAISE EXCEPTION 'permission_denied: apenas o gestor pode alterar a senha de outros membros';
    END IF;
  END IF;

  IF length(p_new_password) < 4 THEN
    RAISE EXCEPTION 'password_too_short: a senha deve ter pelo menos 4 caracteres';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = p_target_user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'auth_user_not_found: conta de login não encontrada';
  END IF;

  UPDATE public.users
  SET must_change_password = p_must_change_password,
      updated_at = now()
  WHERE id = p_target_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.change_member_password(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_member_password(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_member_password(uuid, text, boolean) TO service_role;

-- Confirma e-mails pendentes de contas filho já existentes (bloqueavam login após troca de senha)
UPDATE auth.users au
SET email_confirmed_at = COALESCE(au.email_confirmed_at, now())
FROM public.users u
WHERE u.id = au.id
  AND u.role = 'child'
  AND au.email_confirmed_at IS NULL;
