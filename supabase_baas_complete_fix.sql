-- =============================================================================
-- FamilyBase — correção completa BaaS (login, RLS, perfil, master)
-- Execute no Supabase → SQL Editor (pode executar várias vezes).
-- Depende de: tabelas public.* e auth.users já existentes (supabase.sql, etc.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Funções auxiliares (SECURITY DEFINER = não disparam recursão nas policies)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_current_user_family_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT family_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_current_user_family_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_family_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_family_id() TO service_role;

CREATE OR REPLACE FUNCTION public.is_current_user_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'master'
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_master() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_master() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_master() TO service_role;

-- -----------------------------------------------------------------------------
-- 2) Cada novo utilizador em Auth → linha mínima em public.users (family_id NULL)
--    O RPC register_family_and_user preenche depois família + family_id.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role, family_id, status, must_change_password)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''), split_part(NEW.email::text, '@', 1), 'Utilizador'),
    NEW.email::text,
    'parent',
    NULL,
    'active',
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(NULLIF(trim(EXCLUDED.name), ''), public.users.name),
    updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 3) RPC registo família (mantém lógica existente; idempotente)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_family_and_user(
  p_family_name text DEFAULT NULL,
  p_user_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_fid uuid;
  v_email text;
  v_fn text;
  v_un text;
  meta jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.family_id IS NOT NULL) THEN
    RETURN (
      SELECT jsonb_build_object('family_id', u.family_id, 'already_registered', true)
      FROM public.users u WHERE u.id = v_uid LIMIT 1
    );
  END IF;

  SELECT email::text, COALESCE(raw_user_meta_data, '{}'::jsonb)
  INTO v_email, meta
  FROM auth.users WHERE id = v_uid;

  v_fn := COALESCE(NULLIF(trim(p_family_name), ''), NULLIF(trim(meta->>'family_name'), ''), 'Minha família');
  v_un := COALESCE(NULLIF(trim(p_user_name), ''), NULLIF(trim(meta->>'name'), ''), split_part(v_email, '@', 1), 'Utilizador');

  INSERT INTO public.families (name) VALUES (v_fn) RETURNING id INTO v_fid;

  INSERT INTO public.users (id, name, email, role, family_id, status, must_change_password)
  VALUES (v_uid, v_un, v_email, 'parent', v_fid, 'active', false)
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, public.users.name),
    email = COALESCE(EXCLUDED.email, public.users.email),
    family_id = EXCLUDED.family_id,
    role = CASE WHEN public.users.role = 'master' THEN public.users.role ELSE 'parent' END,
    status = 'active',
    updated_at = now();

  RETURN jsonb_build_object('family_id', v_fid);
END;
$$;

REVOKE ALL ON FUNCTION public.register_family_and_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_family_and_user(text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4) Políticas "Master" e audit_logs — NUNCA usar subquery em public.users sem
--    SECURITY DEFINER (causava erro 500 em GET /users).
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Master read all families" ON public.families;
CREATE POLICY "Master read all families"
  ON public.families FOR SELECT
  USING (public.is_current_user_master());

DROP POLICY IF EXISTS "Master update any family" ON public.families;
CREATE POLICY "Master update any family"
  ON public.families FOR UPDATE
  USING (public.is_current_user_master());

DROP POLICY IF EXISTS "Master read all users" ON public.users;
CREATE POLICY "Master read all users"
  ON public.users FOR SELECT
  USING (public.is_current_user_master());

DROP POLICY IF EXISTS "Master update any user" ON public.users;
CREATE POLICY "Master update any user"
  ON public.users FOR UPDATE
  USING (public.is_current_user_master());

DO $audit$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Only master can read audit logs" ON public.audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "Master read audit logs" ON public.audit_logs';
    EXECUTE $p$
      CREATE POLICY "Master read audit logs"
      ON public.audit_logs FOR SELECT
      USING (public.is_current_user_master());
    $p$;
  END IF;
END
$audit$;

-- -----------------------------------------------------------------------------
-- 5) Garantir que o próprio utilizador pode atualizar o perfil (senha/avatar)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users update own profile" ON public.users;
CREATE POLICY "Users update own profile"
  ON public.users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- -----------------------------------------------------------------------------
-- 6) Utilizadores já existentes em auth.users sem linha em public.users
-- -----------------------------------------------------------------------------

INSERT INTO public.users (id, name, email, role, family_id, status, must_change_password)
SELECT
  au.id,
  COALESCE(NULLIF(trim(au.raw_user_meta_data->>'name'), ''), split_part(au.email::text, '@', 1), 'Utilizador'),
  au.email::text,
  'parent',
  NULL,
  'active',
  false
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.id = au.id)
ON CONFLICT (id) DO NOTHING;
