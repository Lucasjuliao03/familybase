-- Tabelas usadas pelo API Node (family_members, parentes ↔ crianças, catálogo de módulos).
-- Execute no SQL Editor do Supabase depois do script principal, se ainda não existirem.

CREATE TABLE IF NOT EXISTS public.system_modules (
  module_key TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  default_enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  relationship TEXT,
  UNIQUE (family_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.relative_children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relative_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  UNIQUE (relative_user_id, child_id)
);

CREATE INDEX IF NOT EXISTS idx_family_members_family ON public.family_members (family_id);
CREATE INDEX IF NOT EXISTS idx_relative_children_relative ON public.relative_children (relative_user_id);
