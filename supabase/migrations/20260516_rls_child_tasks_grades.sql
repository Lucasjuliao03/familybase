-- RLS: criança (role=user.child) apenas lê/escreve tarefas e notas onde child_id é o próprio perfil.
-- Pais/auxiliares/mantêm acesso integral à família.

CREATE OR REPLACE FUNCTION public.get_current_app_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_child_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
  meta text;
  j jsonb;
BEGIN
  SELECT c.id INTO cid
  FROM public.children c
  WHERE c.user_id = auth.uid()
  LIMIT 1;
  IF cid IS NOT NULL THEN
    RETURN cid;
  END IF;

  BEGIN
    j := COALESCE(to_jsonb(auth.jwt()), '{}'::jsonb);
    meta := trim(COALESCE(
      j #>> '{user_metadata,child_id}',
      j #>> '{user_metadata,childId}',
      j #>> '{app_metadata,child_id}',
      j #>> '{app_metadata,childId}',
      ''
    ));
    IF meta IS NOT NULL AND meta <> '' AND lower(meta) <> 'null' THEN
      cid := meta::uuid;
      IF EXISTS (
        SELECT 1
        FROM public.children c2
        INNER JOIN public.users u ON u.id = auth.uid()
        WHERE c2.id = cid
          AND c2.family_id = u.family_id
      ) THEN
        RETURN cid;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_app_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_child_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_app_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_child_id() TO authenticated;

-- ─── tasks ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view family tasks" ON public.tasks;

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
  AND child_id IN (SELECT id FROM public.children WHERE family_id = public.get_current_user_family_id())
);

CREATE POLICY "tasks_child_select_own"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND public.get_my_child_id() IS NOT NULL
  AND child_id = public.get_my_child_id()
);

CREATE POLICY "tasks_child_insert_own"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND public.get_my_child_id() IS NOT NULL
  AND child_id = public.get_my_child_id()
);

CREATE POLICY "tasks_child_update_own"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND public.get_my_child_id() IS NOT NULL
  AND child_id = public.get_my_child_id()
)
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND public.get_my_child_id() IS NOT NULL
  AND child_id = public.get_my_child_id()
);

-- ─── task_occurrences (lista em MyTasks não pode expor outros filhos) ────────

DROP POLICY IF EXISTS "Users can view family task_occurrences" ON public.task_occurrences;
DROP POLICY IF EXISTS "Family view occurrences" ON public.task_occurrences;
DROP POLICY IF EXISTS "Children update own occurrences status" ON public.task_occurrences;

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
  AND child_id IN (SELECT id FROM public.children WHERE family_id = public.get_current_user_family_id())
);

CREATE POLICY "task_occ_child_select_own"
ON public.task_occurrences
FOR SELECT
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND public.get_my_child_id() IS NOT NULL
  AND child_id = public.get_my_child_id()
);

CREATE POLICY "task_occ_child_insert_own"
ON public.task_occurrences
FOR INSERT
TO authenticated
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND public.get_my_child_id() IS NOT NULL
  AND child_id = public.get_my_child_id()
);

CREATE POLICY "task_occ_child_update_own"
ON public.task_occurrences
FOR UPDATE
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND public.get_my_child_id() IS NOT NULL
  AND child_id = public.get_my_child_id()
)
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND public.get_my_child_id() IS NOT NULL
  AND child_id = public.get_my_child_id()
);

-- ─── grades ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Family can access grades" ON public.grades;

CREATE POLICY "grades_parents_family_all"
ON public.grades
FOR ALL
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() IN ('master', 'parent', 'relative')
)
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() IN ('master', 'parent', 'relative')
  AND child_id IN (SELECT id FROM public.children WHERE family_id = public.get_current_user_family_id())
);

CREATE POLICY "grades_child_select_own"
ON public.grades
FOR SELECT
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND public.get_my_child_id() IS NOT NULL
  AND child_id = public.get_my_child_id()
);

CREATE POLICY "grades_child_insert_own"
ON public.grades
FOR INSERT
TO authenticated
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND public.get_my_child_id() IS NOT NULL
  AND child_id = public.get_my_child_id()
);

CREATE POLICY "grades_child_update_own"
ON public.grades
FOR UPDATE
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND public.get_my_child_id() IS NOT NULL
  AND child_id = public.get_my_child_id()
)
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND public.get_my_child_id() IS NOT NULL
  AND child_id = public.get_my_child_id()
);

CREATE POLICY "grades_child_delete_own"
ON public.grades
FOR DELETE
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND public.get_my_child_id() IS NOT NULL
  AND child_id = public.get_my_child_id()
);
