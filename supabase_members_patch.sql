-- =============================================================================
-- FamilyBase — Patch: Cadastro de membros sem Edge Function
-- Execute no Supabase → SQL Editor (pode executar várias vezes).
-- Depende de: supabase.sql, supabase_baas_complete_fix.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) RPC: add_member_to_family
--    Permite que um responsável (parent) adicione qualquer utilizador à família.
--    Usa SECURITY DEFINER para ultrapassar a RLS do UPDATE em public.users.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_member_to_family(
  p_target_user_id   uuid,
  p_family_id        uuid,
  p_role             text    DEFAULT 'relative',
  p_name             text    DEFAULT NULL,
  p_must_change_password boolean DEFAULT false,
  p_relationship     text    DEFAULT NULL,
  p_access_profile   text    DEFAULT NULL,
  p_phone            text    DEFAULT NULL,
  p_emoji            text    DEFAULT NULL,
  p_display_color    text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_fid  uuid;
  v_caller_role text;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT family_id, role INTO v_caller_fid, v_caller_role
  FROM public.users WHERE id = v_caller_uid;

  -- Só parents e masters podem adicionar membros
  IF v_caller_role NOT IN ('parent', 'master') THEN
    RAISE EXCEPTION 'permission_denied: apenas responsáveis podem adicionar membros';
  END IF;

  -- O parent só pode adicionar à sua própria família
  IF v_caller_role = 'parent' AND v_caller_fid != p_family_id THEN
    RAISE EXCEPTION 'family_mismatch: não pode adicionar membros a outra família';
  END IF;

  -- Valida role
  IF p_role NOT IN ('parent', 'relative', 'child') THEN
    RAISE EXCEPTION 'invalid_role: use parent, relative ou child';
  END IF;

  -- Aguarda que o trigger on_auth_user_created já criou a linha (timing safety)
  -- Tenta inserir linha mínima se ainda não existir (caso raro)
  INSERT INTO public.users (id, name, email, role, family_id, status, must_change_password)
  SELECT
    p_target_user_id,
    COALESCE(p_name, split_part((SELECT email::text FROM auth.users WHERE id = p_target_user_id), '@', 1), 'Utilizador'),
    (SELECT email::text FROM auth.users WHERE id = p_target_user_id),
    p_role,
    p_family_id,
    'active',
    p_must_change_password
  WHERE NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_target_user_id)
  ON CONFLICT (id) DO NOTHING;

  -- Atualiza o perfil do novo utilizador
  UPDATE public.users SET
    name                 = COALESCE(NULLIF(trim(p_name), ''), name),
    role                 = p_role,
    family_id            = p_family_id,
    must_change_password = p_must_change_password,
    access_profile       = COALESCE(p_access_profile, access_profile),
    phone                = COALESCE(p_phone, phone),
    emoji                = COALESCE(p_emoji, emoji),
    display_color        = COALESCE(p_display_color, display_color),
    status               = 'active',
    updated_at           = now()
  WHERE id = p_target_user_id;

  -- Se fornecido, regista relação em family_members (para parentes)
  IF p_relationship IS NOT NULL THEN
    INSERT INTO public.family_members (id, family_id, user_id, relationship)
    VALUES (gen_random_uuid(), p_family_id, p_target_user_id, p_relationship)
    ON CONFLICT (family_id, user_id) DO UPDATE SET relationship = p_relationship;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_target_user_id,
    'family_id', p_family_id,
    'role', p_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_member_to_family(uuid, uuid, text, text, boolean, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_member_to_family(uuid, uuid, text, text, boolean, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_member_to_family(uuid, uuid, text, text, boolean, text, text, text, text, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 2) RLS para family_members e relative_children (não tinham políticas)
-- -----------------------------------------------------------------------------

-- family_members
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Family members can view own family links" ON public.family_members;
CREATE POLICY "Family members can view own family links"
  ON public.family_members FOR SELECT
  USING (family_id = public.get_current_user_family_id());

DROP POLICY IF EXISTS "Parents manage family members links" ON public.family_members;
CREATE POLICY "Parents manage family members links"
  ON public.family_members FOR ALL
  USING (family_id = public.get_current_user_family_id())
  WITH CHECK (family_id = public.get_current_user_family_id());

-- relative_children
ALTER TABLE public.relative_children ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Family can view relative_children" ON public.relative_children;
CREATE POLICY "Family can view relative_children"
  ON public.relative_children FOR SELECT
  USING (family_id = public.get_current_user_family_id());

DROP POLICY IF EXISTS "Parents manage relative_children" ON public.relative_children;
CREATE POLICY "Parents manage relative_children"
  ON public.relative_children FOR ALL
  USING (family_id = public.get_current_user_family_id())
  WITH CHECK (family_id = public.get_current_user_family_id());

-- -----------------------------------------------------------------------------
-- 3) Garante que parents podem fazer INSERT em children (caso a policy não exista)
-- -----------------------------------------------------------------------------

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'children' AND policyname = 'Parents manage children'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Parents manage children" ON public.children
      FOR ALL USING (
        family_id = public.get_current_user_family_id()
      )
      WITH CHECK (
        family_id = public.get_current_user_family_id()
      );
    $p$;
  END IF;
END
$do$;

-- -----------------------------------------------------------------------------
-- 4) RPC: change_member_password
--    Permite que um responsável altere a senha de outro membro da família
--    sem precisar de Edge Function — usa SECURITY DEFINER para aceder a auth.users.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.change_member_password(
  p_target_user_id uuid,
  p_new_password   text
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

  -- Atualiza diretamente o hash bcrypt em auth.users
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = p_target_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.change_member_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_member_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_member_password(uuid, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 5) Colunas defensivas em calendar_events (caso schema mais antigo não as tenha)
-- -----------------------------------------------------------------------------

ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS visible_to_child BOOLEAN DEFAULT true;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'family';
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6C5CE7';
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS end_date DATE;

-- Garante que a constraint de visibility existe (só adiciona se ainda não existir)
DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calendar_events_visibility_check'
      AND conrelid = 'public.calendar_events'::regclass
  ) THEN
    BEGIN
      ALTER TABLE public.calendar_events
        ADD CONSTRAINT calendar_events_visibility_check
        CHECK (visibility IN ('family', 'private', 'child'));
    EXCEPTION WHEN OTHERS THEN
      NULL; -- ignora se já existir com outro nome
    END;
  END IF;
END
$chk$;

-- -----------------------------------------------------------------------------
-- 6) Confirmar Email desativado para auth — lembrete no comentário
--    No Supabase Dashboard: Authentication > Settings > desabilitar
--    "Enable email confirmations" para que signUp retorne sessão imediatamente.
-- -----------------------------------------------------------------------------
