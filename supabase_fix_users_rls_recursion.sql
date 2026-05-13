-- Corrige erro 500 em GET /rest/v1/users (recursão infinita nas políticas RLS).
-- A função get_current_user_family_id() lia public.users sob RLS; as políticas
-- chamam de novo a função → stack overflow / erro interno.
-- Execute este ficheiro no SQL Editor do Supabase (uma vez).

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
