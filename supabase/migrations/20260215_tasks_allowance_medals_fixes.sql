-- FamilyBase: correções mesada/medalhas/tarefas — executar manualmente no SQL Editor ou via migrações.
-- 1) Regras de mesada ligadas ao modelo de tarefa (bonus/desconto)
-- 2) Idempotência de transações por ocorrência
-- 3) Índices de apoio e RLS para task_allowance_rules

CREATE TABLE IF NOT EXISTS public.task_allowance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  affects_allowance BOOLEAN DEFAULT FALSE,
  bonus_amount NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  apply_discount_if_late BOOLEAN DEFAULT FALSE,
  UNIQUE (task_id)
);

ALTER TABLE public.task_allowance_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_task_allowance_rules_all" ON public.task_allowance_rules;
CREATE POLICY "family_task_allowance_rules_all" ON public.task_allowance_rules
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_allowance_rules.task_id
      AND t.family_id = public.get_current_user_family_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_allowance_rules.task_id
      AND t.family_id = public.get_current_user_family_id()
  )
);

CREATE INDEX IF NOT EXISTS idx_allowance_transactions_occ ON public.allowance_transactions(task_occurrence_id)
WHERE task_occurrence_id IS NOT NULL;

-- Uma única linha de mesada ligada por ocorrência (crédito bônus OU débito desconto; mutuamente exclusivos no fluxo normal)
DROP INDEX IF EXISTS ux_allowance_tx_task_occurrence_task_origin;

CREATE UNIQUE INDEX IF NOT EXISTS ux_allowance_tx_task_occurrence_task_origin
  ON public.allowance_transactions(task_occurrence_id)
  WHERE task_occurrence_id IS NOT NULL AND origin = 'task';
