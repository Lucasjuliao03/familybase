-- ============================================================================
-- FamilyBase — consultas para identificar e remover DUPLICATAS ANTIGAS com segurança
-- Revise os resultados SELECT antes de executar DELETE/UPDATE em produção.
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1) Ocorrências duplicadas (mesmo task_id + child_id + occurrence_date, IDs diferentes)
-- -----------------------------------------------------------------------------
-- Visualizar grupos com mais de uma linha:
/*
SELECT task_id, child_id, occurrence_date, COUNT(*) AS n, array_agg(id ORDER BY created_at) AS occurrence_ids
FROM public.task_occurrences
GROUP BY task_id, child_id, occurrence_date
HAVING COUNT(*) > 1;
*/

-- Manter apenas a ocorrência mais recente de cada grupo e listar as que seriam apagadas:
/*
WITH ranked AS (
  SELECT id,
         task_id,
         child_id,
         occurrence_date,
         ROW_NUMBER() OVER (
           PARTITION BY task_id, child_id, occurrence_date
           ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST
         ) AS rn
  FROM public.task_occurrences
)
SELECT id FROM ranked WHERE rn > 1;
*/

-- Apagar apenas duplicatas redundantes (ajuste o critério rn se preferir manter a mais antiga):
/*
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY task_id, child_id, occurrence_date
           ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST
         ) AS rn
  FROM public.task_occurrences
)
DELETE FROM public.task_occurrences WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
*/

-- -----------------------------------------------------------------------------
-- 2) Medalhas conquistadas em duplicata (sem UNIQUE ativo no passado)
-- -----------------------------------------------------------------------------
/*
SELECT medal_id, child_id, COUNT(*) AS n, array_agg(id ORDER BY earned_at) AS earned_ids
FROM public.earned_medals
GROUP BY medal_id, child_id
HAVING COUNT(*) > 1;
*/

-- Manter o registo mais recente por (medal_id, child_id):
/*
DELETE FROM public.earned_medals a
USING public.earned_medals b
WHERE a.medal_id = b.medal_id
  AND a.child_id = b.child_id
  AND a.earned_at < b.earned_at;
*/

-- -----------------------------------------------------------------------------
-- 3) Transações de mesada duplicadas para a mesma ocorrência (origin = task)
-- -----------------------------------------------------------------------------
/*
SELECT task_occurrence_id, COUNT(*) AS n, array_agg(id ORDER BY created_at) AS tx_ids
FROM public.allowance_transactions
WHERE task_occurrence_id IS NOT NULL AND origin = 'task'
GROUP BY task_occurrence_id
HAVING COUNT(*) > 1;
*/

-- Manter a transação mais recente por task_occurrence_id:
/*
DELETE FROM public.allowance_transactions a
USING public.allowance_transactions b
WHERE a.task_occurrence_id = b.task_occurrence_id
  AND a.task_occurrence_id IS NOT NULL
  AND a.origin = 'task'
  AND b.origin = 'task'
  AND a.created_at < b.created_at;
*/

-- Depois de limpar duplicatas, crie o índice único parcial (ver migrations):
-- CREATE UNIQUE INDEX IF NOT EXISTS ux_allowance_tx_task_occurrence_task_origin
--   ON public.allowance_transactions(task_occurrence_id)
--   WHERE task_occurrence_id IS NOT NULL AND origin = 'task';
