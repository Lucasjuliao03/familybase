-- RPC: registo pós-signUp (família + linha em public.users) — executar no SQL Editor do Supabase.
-- Requer que public.users.id referencie auth.users(id) (já em supabase.sql).

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
    RETURN (SELECT jsonb_build_object('family_id', u.family_id, 'already_registered', true)
            FROM public.users u WHERE u.id = v_uid LIMIT 1);
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

-- Políticas para modo só-frontend (evite duplicar nomes se já existirem no projeto)

DROP POLICY IF EXISTS "Users update own profile" ON public.users;
CREATE POLICY "Users update own profile"
  ON public.users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Master read all families" ON public.families;
CREATE POLICY "Master read all families"
  ON public.families FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'master'));

DROP POLICY IF EXISTS "Master update any family" ON public.families;
CREATE POLICY "Master update any family"
  ON public.families FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'master'));

DROP POLICY IF EXISTS "Master read all users" ON public.users;
CREATE POLICY "Master read all users"
  ON public.users FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'master'));

DROP POLICY IF EXISTS "Master update any user" ON public.users;
CREATE POLICY "Master update any user"
  ON public.users FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'master'));
