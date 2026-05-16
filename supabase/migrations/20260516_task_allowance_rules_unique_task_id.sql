-- Garantir uma linha por tarefa (exigido pela app e opcionalmente por upsert/on_conflict na API).
-- Corrige: 42P10 "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- quando a tabela foi criada sem UNIQUE (task_id).

-- Duplicados: ficar só a linha com menor id por task_id.
DELETE FROM public.task_allowance_rules a
USING public.task_allowance_rules b
WHERE a.task_id = b.task_id
  AND a.id > b.id;

-- Índice único (Postgres aceita para ON CONFLICT mesmo que não haja UNIQUE nomeado na DDL antiga).
CREATE UNIQUE INDEX IF NOT EXISTS ux_task_allowance_rules_task_id
  ON public.task_allowance_rules (task_id);
