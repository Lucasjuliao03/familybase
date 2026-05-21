-- Histórico e listagens pai/família por intervalo de dias.
-- Opcional mas recomendado para performance quando o histórico cresce.

CREATE INDEX IF NOT EXISTS ix_task_occurrences_family_occurrence_date
  ON public.task_occurrences (family_id, occurrence_date DESC);

COMMENT ON COLUMN public.tasks.status IS
  'Define o ciclo do modelo em tasks: active = gera ocorrências (recorrente, app); inactive = modelo pausado, histórico de task_occurrences mantém-se; draft = não usado pela app de rotina.';

