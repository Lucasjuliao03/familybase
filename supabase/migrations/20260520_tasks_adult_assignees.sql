-- Permite criar modelo de tarefa para membros adultos da família (assignee_user_id) sem associar sempre a uma criança.
-- Também permite ocorrências "só adulto" mantendo unicidade através de coluna gerada occ_dedupe_key.

-- 1. Remover UNIQUE antigo em (task_id, child_id, occurrence_date), substituindo por chave compatível adulto/criança
DO $$
DECLARE
  cn TEXT;
BEGIN
  FOR cn IN (
    SELECT c.conname::text
    FROM pg_constraint c
    WHERE c.conrelid = 'public.task_occurrences'::regclass
      AND c.contype = 'u'
  )
  LOOP
    EXECUTE format('ALTER TABLE public.task_occurrences DROP CONSTRAINT %I', cn);
  END LOOP;
END $$;

-- 2. Coluna estável para conflitos de UPSERT — prioriza criança se existir, senão o utilizador atribuído
ALTER TABLE public.task_occurrences
  ADD COLUMN IF NOT EXISTS occ_dedupe_key TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN child_id IS NOT NULL THEN 'c:' || child_id::text
      WHEN assignee_user_id IS NOT NULL THEN 'u:' || assignee_user_id::text
      ELSE NULL
    END
  ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_occurrences_task_date_dedupe
  ON public.task_occurrences (task_id, occurrence_date, occ_dedupe_key);

-- 3. child_id opcional quando há assignee ou o inverso
ALTER TABLE public.tasks ALTER COLUMN child_id DROP NOT NULL;
ALTER TABLE public.task_occurrences ALTER COLUMN child_id DROP NOT NULL;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_child_or_assignee_chk;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_child_or_assignee_chk CHECK (
  child_id IS NOT NULL OR assignee_user_id IS NOT NULL
);

ALTER TABLE public.task_occurrences DROP CONSTRAINT IF EXISTS task_occ_child_or_assignee_chk;
ALTER TABLE public.task_occurrences ADD CONSTRAINT task_occ_child_or_assignee_chk CHECK (
  child_id IS NOT NULL OR assignee_user_id IS NOT NULL
);

ALTER TABLE public.task_occurrences DROP CONSTRAINT IF EXISTS task_occ_occ_dedupe_not_null_chk;
ALTER TABLE public.task_occurrences ADD CONSTRAINT task_occ_occ_dedupe_not_null_chk CHECK (occ_dedupe_key IS NOT NULL);

-- 4. TRIGGER: permite INSERT sem child quando assignee está definido
CREATE OR REPLACE FUNCTION public.tasks_bi_set_child_if_missing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  r text;
  cid uuid;
  j jsonb;
  meta text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.child_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.assignee_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida: associe esta tarefa a uma criança ou a um responsável.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = uid AND u.family_id = NEW.family_id) THEN
    RAISE EXCEPTION 'family_id não corresponde ao utilizador autenticado.';
  END IF;

  SELECT u.role INTO r FROM public.users u WHERE u.id = uid LIMIT 1;

  IF r = 'child' THEN
    SELECT c.id INTO cid
    FROM public.children c
    WHERE c.family_id = NEW.family_id
      AND c.user_id = uid
    LIMIT 1;

    IF cid IS NOT NULL THEN
      NEW.child_id := cid;
      RETURN NEW;
    END IF;

    BEGIN
      j := COALESCE(to_jsonb(auth.jwt()), '{}'::jsonb);
      meta := trim(COALESCE(j #>> '{user_metadata,child_id}', j #>> '{app_metadata,child_id}', ''));
      IF meta IS NOT NULL AND meta <> '' AND lower(meta) <> 'null' THEN
        cid := meta::uuid;
        IF EXISTS (
          SELECT 1 FROM public.children c
          WHERE c.id = cid AND c.family_id = NEW.family_id
        ) THEN
          NEW.child_id := cid;
          RETURN NEW;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF NEW.child_id IS NULL AND NEW.assignee_user_id IS NULL THEN
    RAISE EXCEPTION
      'Associe esta tarefa a uma criança ou escolha um responsável/auxiliar registado nesta família.';
  END IF;

  RETURN NEW;
END;
$$;

-- 5. RLS gestores — WITH CHECK permite filho válido OU destinatário adulto válido na família
DROP POLICY IF EXISTS "tasks_parents_family_all" ON public.tasks;

CREATE POLICY "tasks_parents_family_all"
ON public.tasks
FOR ALL
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() IN ('master', 'parent', 'relative')
)
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() IN ('master', 'parent', 'relative')
  AND (
    (
      child_id IS NOT NULL
      AND child_id IN (SELECT id FROM public.children WHERE family_id = public.get_current_user_family_id())
    )
    OR (
      assignee_user_id IS NOT NULL
      AND assignee_user_id IN (SELECT id FROM public.users WHERE family_id = public.get_current_user_family_id())
    )
  )
);

DROP POLICY IF EXISTS "task_occ_parents_family_all" ON public.task_occurrences;

CREATE POLICY "task_occ_parents_family_all"
ON public.task_occurrences
FOR ALL
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() IN ('master', 'parent', 'relative')
)
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() IN ('master', 'parent', 'relative')
  AND (
    (
      child_id IS NOT NULL
      AND child_id IN (SELECT id FROM public.children WHERE family_id = public.get_current_user_family_id())
    )
    OR (
      assignee_user_id IS NOT NULL
      AND assignee_user_id IN (SELECT id FROM public.users WHERE family_id = public.get_current_user_family_id())
    )
  )
);
