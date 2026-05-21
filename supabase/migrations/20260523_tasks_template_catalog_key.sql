-- Modelos pré-definidos FamilyBase (catálogo) — uma linha modelo por slug + criança + família; evita duplicados.

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS template_catalog_key TEXT;

COMMENT ON COLUMN public.tasks.template_catalog_key IS
  'Chave estável oposta ao catálogo da app (slug). Nullable para tarefas criadas manualmente.';

DROP INDEX IF EXISTS public.ux_tasks_family_template_slug_child;

CREATE UNIQUE INDEX ux_tasks_family_template_slug_child
  ON public.tasks (family_id, template_catalog_key, child_id)
  WHERE template_catalog_key IS NOT NULL AND child_id IS NOT NULL;
