-- Corrige RLS em `grades`: criança ligada só por children.user_id = auth.uid() falhava quando
-- get_my_child_id() devolvia NULL (ex.: JWT sem metadados). Passa a aceitar esse vínculo explícito
-- OU get_my_child_id() (JWT validado pela função existente).

DROP POLICY IF EXISTS "grades_child_select_own" ON public.grades;
DROP POLICY IF EXISTS "grades_child_insert_own" ON public.grades;
DROP POLICY IF EXISTS "grades_child_update_own" ON public.grades;
DROP POLICY IF EXISTS "grades_child_delete_own" ON public.grades;

CREATE POLICY "grades_child_select_own"
ON public.grades
FOR SELECT
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND (
    child_id IN (
      SELECT c.id
      FROM public.children c
      WHERE c.family_id = public.get_current_user_family_id()
        AND c.user_id = auth.uid()
    )
    OR (
      public.get_my_child_id() IS NOT NULL
      AND child_id = public.get_my_child_id()
    )
  )
);

CREATE POLICY "grades_child_insert_own"
ON public.grades
FOR INSERT
TO authenticated
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND (
    child_id IN (
      SELECT c.id
      FROM public.children c
      WHERE c.family_id = public.get_current_user_family_id()
        AND c.user_id = auth.uid()
    )
    OR (
      public.get_my_child_id() IS NOT NULL
      AND child_id = public.get_my_child_id()
    )
  )
);

CREATE POLICY "grades_child_update_own"
ON public.grades
FOR UPDATE
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND (
    child_id IN (
      SELECT c.id
      FROM public.children c
      WHERE c.family_id = public.get_current_user_family_id()
        AND c.user_id = auth.uid()
    )
    OR (
      public.get_my_child_id() IS NOT NULL
      AND child_id = public.get_my_child_id()
    )
  )
)
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND (
    child_id IN (
      SELECT c.id
      FROM public.children c
      WHERE c.family_id = public.get_current_user_family_id()
        AND c.user_id = auth.uid()
    )
    OR (
      public.get_my_child_id() IS NOT NULL
      AND child_id = public.get_my_child_id()
    )
  )
);

CREATE POLICY "grades_child_delete_own"
ON public.grades
FOR DELETE
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND (
    child_id IN (
      SELECT c.id
      FROM public.children c
      WHERE c.family_id = public.get_current_user_family_id()
        AND c.user_id = auth.uid()
    )
    OR (
      public.get_my_child_id() IS NOT NULL
      AND child_id = public.get_my_child_id()
    )
  )
);

-- Mesma correção para tarefas/ocorrências (criança com user_id ligado ao perfil).

DROP POLICY IF EXISTS "tasks_child_select_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_child_insert_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_child_update_own" ON public.tasks;

CREATE POLICY "tasks_child_select_own"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND (
    child_id IN (
      SELECT c.id
      FROM public.children c
      WHERE c.family_id = public.get_current_user_family_id()
        AND c.user_id = auth.uid()
    )
    OR (
      public.get_my_child_id() IS NOT NULL
      AND child_id = public.get_my_child_id()
    )
  )
);

CREATE POLICY "tasks_child_insert_own"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND (
    child_id IN (
      SELECT c.id
      FROM public.children c
      WHERE c.family_id = public.get_current_user_family_id()
        AND c.user_id = auth.uid()
    )
    OR (
      public.get_my_child_id() IS NOT NULL
      AND child_id = public.get_my_child_id()
    )
  )
);

CREATE POLICY "tasks_child_update_own"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND (
    child_id IN (
      SELECT c.id
      FROM public.children c
      WHERE c.family_id = public.get_current_user_family_id()
        AND c.user_id = auth.uid()
    )
    OR (
      public.get_my_child_id() IS NOT NULL
      AND child_id = public.get_my_child_id()
    )
  )
)
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND (
    child_id IN (
      SELECT c.id
      FROM public.children c
      WHERE c.family_id = public.get_current_user_family_id()
        AND c.user_id = auth.uid()
    )
    OR (
      public.get_my_child_id() IS NOT NULL
      AND child_id = public.get_my_child_id()
    )
  )
);

DROP POLICY IF EXISTS "task_occ_child_select_own" ON public.task_occurrences;
DROP POLICY IF EXISTS "task_occ_child_insert_own" ON public.task_occurrences;
DROP POLICY IF EXISTS "task_occ_child_update_own" ON public.task_occurrences;

CREATE POLICY "task_occ_child_select_own"
ON public.task_occurrences
FOR SELECT
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND (
    child_id IN (
      SELECT c.id
      FROM public.children c
      WHERE c.family_id = public.get_current_user_family_id()
        AND c.user_id = auth.uid()
    )
    OR (
      public.get_my_child_id() IS NOT NULL
      AND child_id = public.get_my_child_id()
    )
  )
);

CREATE POLICY "task_occ_child_insert_own"
ON public.task_occurrences
FOR INSERT
TO authenticated
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND (
    child_id IN (
      SELECT c.id
      FROM public.children c
      WHERE c.family_id = public.get_current_user_family_id()
        AND c.user_id = auth.uid()
    )
    OR (
      public.get_my_child_id() IS NOT NULL
      AND child_id = public.get_my_child_id()
    )
  )
);

CREATE POLICY "task_occ_child_update_own"
ON public.task_occurrences
FOR UPDATE
TO authenticated
USING (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND (
    child_id IN (
      SELECT c.id
      FROM public.children c
      WHERE c.family_id = public.get_current_user_family_id()
        AND c.user_id = auth.uid()
    )
    OR (
      public.get_my_child_id() IS NOT NULL
      AND child_id = public.get_my_child_id()
    )
  )
)
WITH CHECK (
  family_id = public.get_current_user_family_id()
  AND public.get_current_app_user_role() = 'child'
  AND (
    child_id IN (
      SELECT c.id
      FROM public.children c
      WHERE c.family_id = public.get_current_user_family_id()
        AND c.user_id = auth.uid()
    )
    OR (
      public.get_my_child_id() IS NOT NULL
      AND child_id = public.get_my_child_id()
    )
  )
);
