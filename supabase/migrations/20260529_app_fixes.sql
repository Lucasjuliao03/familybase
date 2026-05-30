-- =============================================================================
-- Migração SQL: Correções e Ajustes de Usuários, Senhas e Tarefas
-- =============================================================================

-- 1) Adicionar coluna 'icon' nas tabelas de tarefas e ocorrências
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE public.task_occurrences ADD COLUMN IF NOT EXISTS icon TEXT;

-- 2) RPC para alterar a senha do próprio utilizador logado e limpar must_change_password
CREATE OR REPLACE FUNCTION public.change_own_password(p_new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Atualiza o hash bcrypt em auth.users do próprio utilizador
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = v_uid;

  -- Atualiza o estado em public.users
  UPDATE public.users
  SET must_change_password = false,
      updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.change_own_password(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_own_password(text) TO authenticated;

-- 3) RPC estendida para alterar a senha de membros da família controlando a flag must_change_password
CREATE OR REPLACE FUNCTION public.change_member_password(
  p_target_user_id uuid,
  p_new_password   text,
  p_must_change_password boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_role text;
  v_caller_fid  uuid;
  v_target_fid  uuid;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role, family_id INTO v_caller_role, v_caller_fid
  FROM public.users WHERE id = v_caller_uid;

  IF v_caller_role NOT IN ('parent', 'master') THEN
    RAISE EXCEPTION 'permission_denied: apenas responsáveis podem alterar senhas de membros';
  END IF;

  SELECT family_id INTO v_target_fid
  FROM public.users WHERE id = p_target_user_id;

  IF v_target_fid IS DISTINCT FROM v_caller_fid THEN
    RAISE EXCEPTION 'family_mismatch: o utilizador alvo não pertence à sua família';
  END IF;

  IF length(p_new_password) < 4 THEN
    RAISE EXCEPTION 'password_too_short: a senha deve ter pelo menos 4 caracteres';
  END IF;

  -- Atualiza hash de senha
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = p_target_user_id;

  -- Atualiza o estado da flag must_change_password contornando RLS
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

-- 4) RPC para exclusão de responsável ou parente da família (exceto gestor inicial)
CREATE OR REPLACE FUNCTION public.delete_family_member(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_role text;
  v_caller_ap   text;
  v_caller_fid  uuid;
  v_target_fid  uuid;
  v_gestor_uid  uuid;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT family_id, role, access_profile INTO v_caller_fid, v_caller_role, v_caller_ap
  FROM public.users WHERE id = v_caller_uid;

  -- Apenas gestores podem apagar
  IF v_caller_role NOT IN ('parent', 'master') OR (v_caller_role = 'parent' AND COALESCE(v_caller_ap, '') != 'gestor') THEN
    RAISE EXCEPTION 'permission_denied: apenas o gestor da família pode excluir membros';
  END IF;

  -- Obter gestor inicial
  SELECT gestor_user_id INTO v_gestor_uid FROM public.families WHERE id = v_caller_fid;

  -- Proibir exclusão do gestor inicial
  IF p_target_user_id = v_gestor_uid THEN
    RAISE EXCEPTION 'cannot_delete_initial_gestor: não é permitido excluir o gestor inicial da família';
  END IF;

  -- Verificar vínculo familiar
  SELECT family_id INTO v_target_fid FROM public.users WHERE id = p_target_user_id;
  IF v_target_fid IS DISTINCT FROM v_caller_fid THEN
    RAISE EXCEPTION 'family_mismatch: o utilizador alvo não pertence à sua família';
  END IF;

  -- Deletar do auth.users (isso cascateia para public.users)
  DELETE FROM auth.users WHERE id = p_target_user_id;
  
  -- Garantir remoção da tabela pública se não cascateou
  DELETE FROM public.users WHERE id = p_target_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_family_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_family_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_family_member(uuid) TO service_role;

-- 5) RPC para exclusão de filho (limpando o login auth.users correspondente)
CREATE OR REPLACE FUNCTION public.delete_family_child(p_child_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_role text;
  v_caller_ap   text;
  v_caller_fid  uuid;
  v_target_fid  uuid;
  v_child_uid   uuid;
  v_gestor_uid  uuid;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT family_id, role, access_profile INTO v_caller_fid, v_caller_role, v_caller_ap
  FROM public.users WHERE id = v_caller_uid;

  -- Apenas gestores
  IF v_caller_role NOT IN ('parent', 'master') OR (v_caller_role = 'parent' AND COALESCE(v_caller_ap, '') != 'gestor') THEN
    RAISE EXCEPTION 'permission_denied: apenas o gestor da família pode excluir filhos';
  END IF;

  SELECT family_id, user_id INTO v_target_fid, v_child_uid FROM public.children WHERE id = p_child_id;
  IF v_target_fid IS DISTINCT FROM v_caller_fid THEN
    RAISE EXCEPTION 'family_mismatch: o filho não pertence à sua família';
  END IF;

  -- Evitar apagar caso bizarro em que a conta associada ao filho seja o gestor inicial
  SELECT gestor_user_id INTO v_gestor_uid FROM public.families WHERE id = v_caller_fid;
  IF v_child_uid = v_gestor_uid THEN
    RAISE EXCEPTION 'cannot_delete_initial_gestor';
  END IF;

  -- Se tiver login associado, apagar conta do utilizador
  IF v_child_uid IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_child_uid;
    DELETE FROM public.users WHERE id = v_child_uid;
  END IF;

  -- Deletar filho (os ON DELETE CASCADE apagam as ocorrências de tarefas, mesadas, etc.)
  DELETE FROM public.children WHERE id = p_child_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_family_child(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_family_child(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_family_child(uuid) TO service_role;
