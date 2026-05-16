-- FamilyBase — Catálogo global de medalhas: slug estável, remoção de duplicadas, 30 conquistas-base.
-- Executar no SQL Editor: colar o ficheiro inteiro e executar de uma vez (BEGIN…COMMIT).
-- O catálogo final usa uma única instrução WITH (sem TEMP TABLE), para o dashboard não partir por ligações diferentes.

BEGIN;

ALTER TABLE public.medals ADD COLUMN IF NOT EXISTS catalog_slug TEXT;

COMMENT ON COLUMN public.medals.catalog_slug IS 'Chave estável do catálogo global (somente quando family_id IS NULL). Permite UPSERT sem duplicar UUIDs.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_medals_global_catalog_slug
  ON public.medals (catalog_slug)
  WHERE (family_id IS NULL AND catalog_slug IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Deduplicação: mesma chave que o cliente (canonicalMedalRequirementType + grupo + valor)
-- ---------------------------------------------------------------------------

WITH enriched AS (
  SELECT
    m.*,
    lower(trim(coalesce(m.medal_group, ''))) AS mg,
    lower(trim(coalesce(m.name, ''))) AS name_n,
    regexp_replace(lower(trim(coalesce(m.name, ''))), '\s+', ' ', 'g') AS name_fold,
    CASE lower(trim(coalesce(m.requirement_type, '')))
      WHEN 'tasks_completed' THEN 'task_count'
      WHEN 'streak' THEN 'task_streak'
      WHEN 'first_reward' THEN 'reward_redemptions'
      WHEN 'allowance_goal' THEN 'allowance_paid_cycles'
      ELSE lower(trim(coalesce(m.requirement_type, '')))
    END AS crt,
    coalesce(requirement_value, 0)::integer AS rv0
  FROM public.medals m
),
computed AS (
  SELECT
    e.*,
    CASE
      WHEN crt = 'custom' THEN 'custom:' || name_fold || '|' || mg
      WHEN trim(coalesce(e.requirement_type, '')) = '' THEN 'name:' || NULLIF(trim(name_fold), '')
      ELSE
        'req:' || crt || '|' ||
        CASE
          WHEN crt IN ('task_count', 'task_streak', 'perfect_grade', 'reward_redemptions', 'allowance_paid_cycles', 'points_goal')
          THEN greatest(1, coalesce(rv0, 1))::text
          ELSE coalesce(rv0, 0)::text
        END
        || '|' || mg
    END AS dkey
  FROM enriched e
),
keepers AS (
  SELECT DISTINCT ON (coalesce(computed.family_id::text, '!global'), computed.dkey)
    computed.id AS keep_id,
    coalesce(computed.family_id::text, '!global') AS fam_key,
    computed.dkey
  FROM computed
  WHERE computed.dkey IS NOT NULL AND trim(computed.dkey) <> ''
  ORDER BY coalesce(computed.family_id::text, '!global'), computed.dkey, computed.created_at ASC NULLS LAST, computed.id ASC
),
dupes AS (
  SELECT c.id AS dup_id, k.keep_id
  FROM computed c
  INNER JOIN keepers k
    ON coalesce(c.family_id::text, '!global') = k.fam_key
   AND c.dkey = k.dkey
  WHERE c.id <> k.keep_id
)
UPDATE public.earned_medals em
SET medal_id = d.keep_id
FROM dupes d
WHERE em.medal_id = d.dup_id
  AND NOT EXISTS (
    SELECT 1 FROM public.earned_medals e2 WHERE e2.child_id = em.child_id AND e2.medal_id = d.keep_id
  );

WITH enriched AS (
  SELECT
    m.*,
    lower(trim(coalesce(m.medal_group, ''))) AS mg,
    regexp_replace(lower(trim(coalesce(m.name, ''))), '\s+', ' ', 'g') AS name_fold,
    CASE lower(trim(coalesce(m.requirement_type, '')))
      WHEN 'tasks_completed' THEN 'task_count'
      WHEN 'streak' THEN 'task_streak'
      WHEN 'first_reward' THEN 'reward_redemptions'
      WHEN 'allowance_goal' THEN 'allowance_paid_cycles'
      ELSE lower(trim(coalesce(m.requirement_type, '')))
    END AS crt,
    coalesce(requirement_value, 0)::integer AS rv0
  FROM public.medals m
),
computed AS (
  SELECT
    e.*,
    CASE
      WHEN crt = 'custom' THEN 'custom:' || name_fold || '|' || mg
      WHEN trim(coalesce(e.requirement_type, '')) = '' THEN 'name:' || NULLIF(trim(name_fold), '')
      ELSE
        'req:' || crt || '|' ||
        CASE
          WHEN crt IN ('task_count', 'task_streak', 'perfect_grade', 'reward_redemptions', 'allowance_paid_cycles', 'points_goal')
          THEN greatest(1, coalesce(rv0, 1))::text
          ELSE coalesce(rv0, 0)::text
        END
        || '|' || mg
    END AS dkey
  FROM enriched e
),
keepers AS (
  SELECT DISTINCT ON (coalesce(computed.family_id::text, '!global'), computed.dkey)
    computed.id AS keep_id,
    coalesce(computed.family_id::text, '!global') AS fam_key,
    computed.dkey
  FROM computed
  WHERE computed.dkey IS NOT NULL AND trim(computed.dkey) <> ''
  ORDER BY coalesce(computed.family_id::text, '!global'), computed.dkey, computed.created_at ASC NULLS LAST, computed.id ASC
),
dupes AS (
  SELECT c.id AS dup_id, k.keep_id
  FROM computed c
  INNER JOIN keepers k
    ON coalesce(c.family_id::text, '!global') = k.fam_key
   AND c.dkey = k.dkey
  WHERE c.id <> k.keep_id
)
DELETE FROM public.earned_medals em
USING dupes d
WHERE em.medal_id = d.dup_id;

WITH enriched AS (
  SELECT
    m.*,
    lower(trim(coalesce(m.medal_group, ''))) AS mg,
    regexp_replace(lower(trim(coalesce(m.name, ''))), '\s+', ' ', 'g') AS name_fold,
    CASE lower(trim(coalesce(m.requirement_type, '')))
      WHEN 'tasks_completed' THEN 'task_count'
      WHEN 'streak' THEN 'task_streak'
      WHEN 'first_reward' THEN 'reward_redemptions'
      WHEN 'allowance_goal' THEN 'allowance_paid_cycles'
      ELSE lower(trim(coalesce(m.requirement_type, '')))
    END AS crt,
    coalesce(requirement_value, 0)::integer AS rv0
  FROM public.medals m
),
computed AS (
  SELECT
    e.*,
    CASE
      WHEN crt = 'custom' THEN 'custom:' || name_fold || '|' || mg
      WHEN trim(coalesce(e.requirement_type, '')) = '' THEN 'name:' || NULLIF(trim(name_fold), '')
      ELSE
        'req:' || crt || '|' ||
        CASE
          WHEN crt IN ('task_count', 'task_streak', 'perfect_grade', 'reward_redemptions', 'allowance_paid_cycles', 'points_goal')
          THEN greatest(1, coalesce(rv0, 1))::text
          ELSE coalesce(rv0, 0)::text
        END
        || '|' || mg
    END AS dkey
  FROM enriched e
),
keepers AS (
  SELECT DISTINCT ON (coalesce(computed.family_id::text, '!global'), computed.dkey)
    computed.id AS keep_id,
    coalesce(computed.family_id::text, '!global') AS fam_key,
    computed.dkey
  FROM computed
  WHERE computed.dkey IS NOT NULL AND trim(computed.dkey) <> ''
  ORDER BY coalesce(computed.family_id::text, '!global'), computed.dkey, computed.created_at ASC NULLS LAST, computed.id ASC
),
dupes AS (
  SELECT c.id AS dup_id, k.keep_id
  FROM computed c
  INNER JOIN keepers k
    ON coalesce(c.family_id::text, '!global') = k.fam_key
   AND c.dkey = k.dkey
  WHERE c.id <> k.keep_id
)
DELETE FROM public.medals md
WHERE md.id IN (SELECT dup_id FROM dupes);

-- Catálogo: 30 medalhas — uma única instrução (sem TEMP TABLE). O SQL Editor do Supabase
-- por vezes executa cada comando noutra ligação; TEMP desaparece → 42P01. CTE + UPDATE + INSERT na mesma query evita isso.
WITH seed AS (
  SELECT * FROM (VALUES
 ('gb_tc_01', 'Primeiro passo', 'First stride', 'Celebra a primeira tarefa concluída com sucesso!', 'Celebrate your very first approved task!', '🌱', '#00B894', 'tasks', 'routine', 'task_count', 1, 5, 'Concedida ao completar 1 tarefa aprovada.', true),
 ('gb_tc_03', 'Explorador do hábito', 'Habit explorer', 'Três conquistas mostram consistência já no início.', 'Three wins prove you''re building a habit early.', '⭐', '#FDCB6E', 'tasks', 'routine', 'task_count', 3, 6, '3 tarefas aprovadas.', true),
 ('gb_tc_05', 'Mão na massa', 'Hands-on hero', 'Cinco conquistas — orgulho de quem faz acontecer.', 'Five completed tasks—you make things happen.', '✋', '#6C5CE7', 'tasks', 'routine', 'task_count', 5, 10, '5 tarefas aprovadas.', true),
 ('gb_tc_10', 'Radar de conquistas', 'Achievement radar', 'Dez vitórias: já dá para ver o progresso no mapa da família!', 'Ten wins—your progress shines on the family map!', '📍', '#74B9FF', 'tasks', 'routine', 'task_count', 10, 12, '10 tarefas aprovadas.', true),
 ('gb_tc_15', 'Persistente', 'Keeps showing up', 'Quinze tarefas: disciplina conta mais que motivação.', 'Fifteen tasks—discipline beats motivation.', '🎯', '#A29BFE', 'tasks', 'routine', 'task_count', 15, 15, '15 tarefas aprovadas.', true),
 ('gb_tc_25', 'Veterano das tarefas', 'Task veteran', 'Vinte e cinco conquistas inspiram os mais novos também.', 'Twenty-five completions inspire everyone around you.', '🛡️', '#0984E3', 'tasks', 'routine', 'task_count', 25, 20, '25 tarefas aprovadas.', true),
 ('gb_tc_40', 'Resiliente', 'Resilient star', 'Quarenta tarefas: voltar sempre a tentar faz a diferença.', 'Forty tasks—bounce-back effort makes the difference.', '💠', '#E84393', 'tasks', 'routine', 'task_count', 40, 30, '40 tarefas aprovadas.', true),
 ('gb_tc_60', 'Superestrela', 'Superstar saver', 'Sessenta provas de compromisso com a rotina!', 'Sixty proofs you own your routines!', '🌟', '#FD79A8', 'tasks', 'routine', 'task_count', 60, 35, '60 tarefas aprovadas.', true),
 ('gb_tc_100', 'Lenda das tarefas', 'Task legend', 'Cem vitórias: um exemplo vivo de constância.', 'One hundred completions—a living lesson in grit.', '🏆', '#E17055', 'tasks', 'routine', 'task_count', 100, 75, '100 tarefas aprovadas.', true),
 ('gb_ts_02', 'Dois dias firme', 'Two-day streak', 'Dois dias seguidos a cumprir: o hábito começa assim.', 'Two days in a row—habits spark like this.', '🔥', '#FDCB6E', 'streak', 'routine', 'task_streak', 2, 4, 'Sequência de 2 dias com tarefas aprovadas.', true),
 ('gb_ts_05', 'Fogo de artifício', 'Fireworks focus', 'Cinco dias consecutivos: energia contagiante!', 'Five straight days—you bring contagious energy!', '🎆', '#E84393', 'streak', 'routine', 'task_streak', 5, 8, 'Sequência de 5 dias.', true),
 ('gb_ts_10', 'Dez de ouro', 'Ten-day bronze', 'Dez dias a mostrar dedicação diária.', 'Ten straight days proving daily dedication!', '🥉', '#D68910', 'streak', 'routine', 'task_streak', 10, 14, 'Sequência de 10 dias.', true),
 ('gb_ts_14', 'Duas semanas inteiras', 'Full two-week run', 'Catorze dias: já é uma rotina a sério!', 'Fourteen days—this is routine for real.', '📅', '#00CEC9', 'streak', 'routine', 'task_streak', 14, 18, 'Sequência de 14 dias.', true),
 ('gb_ts_21', 'Hábito em construção', 'Habit under construction', 'Vinte e um dias — caminho típico para fixar hábitos.', 'Twenty-one days—classic path to locking habits.', '🧱', '#55EFC4', 'streak', 'routine', 'task_streak', 21, 28, 'Sequência de 21 dias.', true),
 ('gb_ts_30', 'Mês admirável', 'Admirable month', 'Trinta dias: orgulho da família!', 'Thirty days—your whole family cheers!', '🥇', '#F39C12', 'streak', 'routine', 'task_streak', 30, 45, 'Sequência de 30 dias.', true),
 ('gb_ts_45', 'Maratona gentil', 'Gentle marathon', 'Quarenta e cinco dias de maturidade nas responsabilidades.', 'Forty-five days of maturity in responsibility.', '🎖️', '#8E44AD', 'streak', 'routine', 'task_streak', 45, 55, 'Sequência de 45 dias.', true),
 ('gb_ts_60', 'Meia temporada imbatível', 'Unbroken half-season', 'Sessenta dias consecutivos: raridade e inspiração.', 'Sixty straight days—inspiration rarity!', '👑', '#2D3436', 'streak', 'routine', 'task_streak', 60, 80, 'Sequência de 60 dias.', true),
 ('gb_pg_01', 'Brilho inaugural', 'Shining debut', 'A primeira nota máxima abre caminho aos próximos desafios.', 'Your first top score unlocks bolder goals.', '🎓', '#6C5CE7', 'grades', 'studies', 'perfect_grade', 1, 6, '1 avaliação com nota máxima na escala da prova.', true),
 ('gb_pg_03', 'Trio excelente', 'Excellent trio', 'Três excelências — orgulho no caderno e em ti.', 'Three straight top marks—you should beam.', '📝', '#0984E3', 'grades', 'studies', 'perfect_grade', 3, 14, '3 avaliações com nota máxima.', true),
 ('gb_pg_05', 'Cinco estrelas de estudo', 'Five-star scholar', 'Cinco conquistas académicas de topo!', 'Five top marks—academic brilliance!', '🌠', '#00B894', 'grades', 'studies', 'perfect_grade', 5, 20, '5 avaliações com nota máxima.', true),
 ('gb_pg_10', 'Constância de excelência', 'Excellence steady', 'Dez avaliações impecáveis: disciplina nos estudos.', 'Ten impeccable scores—study discipline!', '📚', '#E17055', 'grades', 'studies', 'perfect_grade', 10, 40, '10 avaliações com nota máxima.', true),
 ('gb_pt_50', 'Cofre de pontos', 'Points vault', 'Cinquenta pontos acumulados — guarda bem essa conquista!', 'Fifty points saved up—stash that win!', '💎', '#A29BFE', 'special', 'rewards', 'points_goal', 50, 5, 'Atingir 50 pontos na conta da criança.', true),
 ('gb_pt_200', 'Caçador de conquistas', 'Achievement hunter', 'Duzentos pontos — mostras que objetivos são divertidos!', 'Two hundred points—you chase goals joyfully!', '🏹', '#FD79A8', 'special', 'rewards', 'points_goal', 200, 20, 'Atingir 200 pontos.', true),
 ('gb_pt_500', 'Muralha de pontos', 'Points fortress', 'Quinhentos pontos — referência dentro de casa!', 'Five hundred points—household MVP energy!', '🏰', '#636E72', 'special', 'rewards', 'points_goal', 500, 50, 'Atingir 500 pontos.', true),
 ('gb_rr_01', 'Primeira recompensa', 'First redemption', 'O primeiro pedido aprovado liga esforço a desejos!', 'Approved first redemption—effort meets dreams!', '🎁', '#FDCB6E', 'special', 'rewards', 'reward_redemptions', 1, 8, '1 pedido de recompensa aprovado na loja da família.', true),
 ('gb_rr_05', 'Comprador inteligente', 'Smart chooser', 'Cinco pedidos bem pensados!', 'Five thoughtful redemption choices!', '🧠', '#00CEC9', 'special', 'rewards', 'reward_redemptions', 5, 18, '5 pedidos de recompensa aprovados.', true),
 ('gb_rr_10', 'Caçador de recompensas', 'Reward raider', 'Dez pedidos aprovados: sabes negociar objectivos!', 'Ten approved requests—you negotiate goals well!', '🎪', '#E84393', 'special', 'rewards', 'reward_redemptions', 10, 28, '10 pedidos de recompensa aprovados.', true),
 ('gb_al_02', 'Duas mesadas honradas', 'Two payouts kept', 'Duas vezes a mesada foi paga.', 'Two paid allowance cycles.', '💶', '#00B894', 'allowance', 'allowance', 'allowance_paid_cycles', 2, 10, '2 ciclos de mesada marcados como paid', true),
 ('gb_al_06', 'Meio ano de responsabilidade', 'Half-year steward', 'Seis mesadas pagas mostram maturidade financeira.', 'Six paid allowance cycles.', '🐖', '#74B9FF', 'allowance', 'allowance', 'allowance_paid_cycles', 6, 25, '6 ciclos de mesada marcados como paid', true),
 ('gb_al_12', 'Ano de mesada exemplar', 'Year of allowance wins', 'Doze mesadas pagas: exemplo de planeamento.', 'Twelve paid cycles - planning champion!', '🏦', '#6C5CE7', 'allowance', 'allowance', 'allowance_paid_cycles', 12, 50, '12 ciclos de mesada com estado paid', true)
  ) AS t(
    catalog_slug,
    name,
    name_en,
    description,
    description_en,
    icon,
    color,
    category,
    medal_group,
    requirement_type,
    requirement_value,
    extra_points,
    rule_description,
    is_active
  )
),
_apply AS (
  UPDATE public.medals m
  SET
    catalog_slug = s.catalog_slug,
    name = s.name,
    name_en = s.name_en,
    description = s.description,
    description_en = s.description_en,
    icon = coalesce(s.icon, m.icon),
    color = coalesce(s.color, m.color),
    category = s.category,
    medal_group = s.medal_group,
    requirement_type = s.requirement_type,
    requirement_value = s.requirement_value,
    extra_points = coalesce(s.extra_points, m.extra_points),
    rule_description = s.rule_description,
    is_active = coalesce(s.is_active, m.is_active)
  FROM seed s
  WHERE m.family_id IS NULL
    AND lower(trim(coalesce(m.medal_group, ''))) = s.medal_group
    AND s.requirement_type = CASE lower(trim(coalesce(m.requirement_type, '')))
      WHEN 'tasks_completed' THEN 'task_count'
      WHEN 'streak' THEN 'task_streak'
      WHEN 'first_reward' THEN 'reward_redemptions'
      WHEN 'allowance_goal' THEN 'allowance_paid_cycles'
      ELSE lower(trim(coalesce(m.requirement_type, '')))
    END
    AND CASE WHEN s.requirement_type IN ('task_count', 'task_streak', 'perfect_grade', 'reward_redemptions', 'allowance_paid_cycles', 'points_goal')
      THEN greatest(1, coalesce(m.requirement_value, 1))
      ELSE coalesce(m.requirement_value, 0)
    END = s.requirement_value
    AND (m.catalog_slug IS NULL OR m.catalog_slug = s.catalog_slug)
  RETURNING m.id
)
INSERT INTO public.medals (
  catalog_slug, name, name_en, description, description_en,
  icon, color, category, medal_group,
  requirement_type, requirement_value, extra_points, rule_description, is_active, family_id
)
SELECT
  s.catalog_slug, s.name, s.name_en, s.description, s.description_en,
  s.icon, s.color, s.category, s.medal_group,
  s.requirement_type, s.requirement_value, s.extra_points, s.rule_description,
  coalesce(s.is_active, true), NULL::uuid
FROM seed s
WHERE NOT EXISTS (
  SELECT 1 FROM public.medals g WHERE g.family_id IS NULL AND g.catalog_slug = s.catalog_slug
);

COMMIT;
