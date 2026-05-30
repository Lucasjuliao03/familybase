-- Corrige detecção de gestor (access_profile NULL = gestor) e RPCs de senha/exclusão.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Gestor = master, parent com access_profile gestor (NULL conta como gestor),
-- ou utilizador definido como gestor_user_id da família.
CREATE OR REPLACE FUNCTION public.user_is_family_gestor(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    LEFT JOIN public.families f ON f.id = u.family_id
    WHERE u.id = p_uid
      AND (
        u.role = 'master'
        OR (
          u.role = 'parent'
          AND (
            COALESCE(NULLIF(trim(lower(u.access_profile::text)), ''), 'gestor') = 'gestor'
            OR f.gestor_user_id = u.id
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_is_family_gestor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_family_gestor(uuid) TO authenticated;

-- Normaliza gestores financeiros sem access_profile explícito
UPDATE public.users u
SET access_profile = 'gestor', updated_at = now()
WHERE u.role = 'parent'
  AND (u.access_profile IS NULL OR trim(u.access_profile::text) = '')
  AND EXISTS (
    SELECT 1 FROM public.families f
    WHERE f.id = u.family_id AND f.gestor_user_id = u.id
  );

CREATE OR REPLACE FUNCTION public.change_own_password(p_new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF length(p_new_password) < 4 THEN
    RAISE EXCEPTION 'password_too_short: a senha deve ter pelo menos 4 caracteres';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = v_uid;

  UPDATE public.users
  SET must_change_password = false,
      updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.change_own_password(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_own_password(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.change_member_password(
  p_target_user_id uuid,
  p_new_password   text,
  p_must_change_password boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_fid  uuid;
  v_target_fid  uuid;
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

  -- Própria senha: qualquer membro adulto; senha de outro: só gestor
  IF p_target_user_id IS DISTINCT FROM v_caller_uid THEN
    IF NOT public.user_is_family_gestor(v_caller_uid) THEN
      RAISE EXCEPTION 'permission_denied: apenas o gestor pode alterar a senha de outros membros';
    END IF;
  END IF;

  IF length(p_new_password) < 4 THEN
    RAISE EXCEPTION 'password_too_short: a senha deve ter pelo menos 4 caracteres';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = p_target_user_id;

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

CREATE OR REPLACE FUNCTION public.delete_family_member(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_fid  uuid;
  v_target_fid  uuid;
  v_gestor_uid  uuid;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT family_id INTO v_caller_fid FROM public.users WHERE id = v_caller_uid;

  IF NOT public.user_is_family_gestor(v_caller_uid) THEN
    RAISE EXCEPTION 'permission_denied: apenas o gestor da família pode excluir membros';
  END IF;

  SELECT gestor_user_id INTO v_gestor_uid FROM public.families WHERE id = v_caller_fid;

  IF p_target_user_id = v_gestor_uid THEN
    RAISE EXCEPTION 'cannot_delete_initial_gestor: não é permitido excluir o gestor inicial da família';
  END IF;

  SELECT family_id INTO v_target_fid FROM public.users WHERE id = p_target_user_id;
  IF v_target_fid IS DISTINCT FROM v_caller_fid THEN
    RAISE EXCEPTION 'family_mismatch: o utilizador alvo não pertence à sua família';
  END IF;

  DELETE FROM auth.users WHERE id = p_target_user_id;
  DELETE FROM public.users WHERE id = p_target_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_family_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_family_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_family_member(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_family_child(p_child_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_fid  uuid;
  v_target_fid  uuid;
  v_child_uid   uuid;
  v_gestor_uid  uuid;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT family_id INTO v_caller_fid FROM public.users WHERE id = v_caller_uid;

  IF NOT public.user_is_family_gestor(v_caller_uid) THEN
    RAISE EXCEPTION 'permission_denied: apenas o gestor da família pode excluir filhos';
  END IF;

  SELECT family_id, user_id INTO v_target_fid, v_child_uid
  FROM public.children WHERE id = p_child_id;

  IF v_target_fid IS DISTINCT FROM v_caller_fid THEN
    RAISE EXCEPTION 'family_mismatch: o filho não pertence à sua família';
  END IF;

  SELECT gestor_user_id INTO v_gestor_uid FROM public.families WHERE id = v_caller_fid;
  IF v_child_uid = v_gestor_uid THEN
    RAISE EXCEPTION 'cannot_delete_initial_gestor';
  END IF;

  IF v_child_uid IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_child_uid;
    DELETE FROM public.users WHERE id = v_child_uid;
  END IF;

  DELETE FROM public.children WHERE id = p_child_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_family_child(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_family_child(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_family_child(uuid) TO service_role;
