-- Opcional: corrigir o “burst” antigo (várias semanas materializadas) em tarefas DIÁrias.
-- Apaga apenas ocorrências AINDA NÃO concluídas com data CIMA DE HOJE.
-- Revista com SELECT primeiro; CURRENT_DATE é a data do servidor (UTC).

-- Preview:
-- SELECT o.id, o.occurrence_date, o.status, t.title FROM public.task_occurrences o
-- JOIN public.tasks t ON t.id = o.task_id
-- WHERE COALESCE(t.is_recurring,false) AND t.frequency = 'daily'
--   AND o.occurrence_date > CURRENT_DATE AND o.status IN ('pending','delayed','in_progress');

DELETE FROM public.task_occurrences o
USING public.tasks t
WHERE o.task_id = t.id
  AND COALESCE(t.is_recurring, false) = true
  AND t.frequency = 'daily'
  AND o.occurrence_date > CURRENT_DATE
  AND o.status IN ('pending', 'delayed', 'in_progress');
