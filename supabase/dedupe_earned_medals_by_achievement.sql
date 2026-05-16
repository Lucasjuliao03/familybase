-- ============================================================================
-- FamilyBase — limpar conquistas duplicadas em earned_medals
-- Mesma lógica que o cliente: tipo + valor normalizado + medal_group,
-- ou nome normalizado quando requirement_type está vazio (legado).
-- Execute primeiro os SELECT indicados antes de DELETE.
-- ============================================================================

-- Pré-visualização: quantos IDs serão removidos por criança
/*
WITH medal_keys AS (
  SELECT em.id AS earned_medal_id,
         em.child_id,
         em.earned_at,
         CASE
           WHEN COALESCE(trim(m.requirement_type), '') = '' THEN
             'name:' || lower(trim(regexp_replace(coalesce(m.name, ''), E'\\s+', ' ', 'g')))
           ELSE
             'req:' || lower(trim(m.requirement_type)) || '|'
             || CASE
                  WHEN lower(trim(m.requirement_type)) IN ('task_count', 'task_streak') THEN
                    CASE
                      WHEN m.requirement_value IS NULL OR m.requirement_value < 1 THEN '1'
                      ELSE m.requirement_value::text
                    END
                  ELSE COALESCE(m.requirement_value, 0)::text
                END
             || '|' || lower(trim(coalesce(m.medal_group, '')))
         END AS dedupe_key
  FROM public.earned_medals em
  INNER JOIN public.medals m ON m.id = em.medal_id
),
ranked AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY child_id, dedupe_key
           ORDER BY earned_at ASC NULLS LAST, earned_medal_id ASC
         ) AS rn
  FROM medal_keys
  WHERE dedupe_key <> '' AND dedupe_key <> 'name:'
)
SELECT child_id,
       COUNT(*) FILTER (WHERE rn > 1) AS linhas_extra,
       COUNT(*) AS total_no_grupo
FROM ranked
GROUP BY child_id
HAVING COUNT(*) FILTER (WHERE rn > 1) > 0
ORDER BY linhas_extra DESC;
*/

-- Listar linhas a apagar (ex.: filtrar por nome da criança ou child_id UUID)
/*
WITH medal_keys AS (
  SELECT em.id AS earned_medal_id,
         em.child_id,
         c.name AS child_name,
         m.name AS medal_name,
         em.earned_at,
         CASE
           WHEN COALESCE(trim(m.requirement_type), '') = '' THEN
             'name:' || lower(trim(regexp_replace(coalesce(m.name, ''), E'\\s+', ' ', 'g')))
           ELSE
             'req:' || lower(trim(m.requirement_type)) || '|'
             || CASE
                  WHEN lower(trim(m.requirement_type)) IN ('task_count', 'task_streak') THEN
                    CASE
                      WHEN m.requirement_value IS NULL OR m.requirement_value < 1 THEN '1'
                      ELSE m.requirement_value::text
                    END
                  ELSE COALESCE(m.requirement_value, 0)::text
                END
             || '|' || lower(trim(coalesce(m.medal_group, '')))
         END AS dedupe_key
  FROM public.earned_medals em
  INNER JOIN public.medals m ON m.id = em.medal_id
  INNER JOIN public.children c ON c.id = em.child_id
),
ranked AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY child_id, dedupe_key
           ORDER BY earned_at ASC NULLS LAST, earned_medal_id ASC
         ) AS rn
  FROM medal_keys
  WHERE dedupe_key <> '' AND dedupe_key <> 'name:'
)
SELECT earned_medal_id, child_id, child_name, medal_name, dedupe_key, rn
FROM ranked
WHERE rn > 1
ORDER BY child_name, dedupe_key, rn;
*/

-- Apagar conquistas repetidas por (child_id, mesma conquista), mantém o primeiro por earned_at
/*
WITH medal_keys AS (
  SELECT em.id AS earned_medal_id,
         em.child_id,
         em.earned_at,
         CASE
           WHEN COALESCE(trim(m.requirement_type), '') = '' THEN
             'name:' || lower(trim(regexp_replace(coalesce(m.name, ''), E'\\s+', ' ', 'g')))
           ELSE
             'req:' || lower(trim(m.requirement_type)) || '|'
             || CASE
                  WHEN lower(trim(m.requirement_type)) IN ('task_count', 'task_streak') THEN
                    CASE
                      WHEN m.requirement_value IS NULL OR m.requirement_value < 1 THEN '1'
                      ELSE m.requirement_value::text
                    END
                  ELSE COALESCE(m.requirement_value, 0)::text
                END
             || '|' || lower(trim(coalesce(m.medal_group, '')))
         END AS dedupe_key
  FROM public.earned_medals em
  INNER JOIN public.medals m ON m.id = em.medal_id
),
ranked AS (
  SELECT earned_medal_id,
         ROW_NUMBER() OVER (
           PARTITION BY child_id, dedupe_key
           ORDER BY earned_at ASC NULLS LAST, earned_medal_id ASC
         ) AS rn
  FROM medal_keys
  WHERE dedupe_key <> '' AND dedupe_key <> 'name:'
)
DELETE FROM public.earned_medals em
WHERE em.id IN (SELECT earned_medal_id FROM ranked WHERE rn > 1);
*/

-- Opcional: analisar definições repetidas na tabela medals (mesmo nome / mesma conquista).
-- Prefira remover só earned_medals até a app estabilizar; apagar defs exige revisão de FKs e seed.
