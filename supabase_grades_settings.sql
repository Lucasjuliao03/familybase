-- ============================================================
-- Supabase: Módulo de Notas Escolares — Schema Completo
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- 1. Tabela de configuração geral do modelo de avaliação por aluno
CREATE TABLE IF NOT EXISTS school_grade_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id            uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  evaluation_model    text NOT NULL DEFAULT 'bimonthly', -- 'bimonthly' | 'trimester'
  periods_count       int  NOT NULL DEFAULT 4,
  annual_total_points numeric NOT NULL DEFAULT 100,
  -- Porcentagem de aprovação global (ex: 60 = 60%)
  approval_pct        numeric NOT NULL DEFAULT 60,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, child_id)
);

-- 2. Tabela de configuração por período (bimestre/trimestre)
--    Permite definir pontos e % de aprovação diferentes por período
CREATE TABLE IF NOT EXISTS school_grade_periods (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id            uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  period_number       int  NOT NULL, -- 1, 2, 3, 4
  period_label        text,          -- "1º Bimestre", custom se quiser
  total_points        numeric NOT NULL DEFAULT 25,
  approval_pct        numeric NOT NULL DEFAULT 60, -- % do total para aprovação
  weight              numeric NOT NULL DEFAULT 1,  -- peso para média ponderada
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, child_id, period_number)
);

-- 3. Adicionar colunas às grades se não existirem
ALTER TABLE grades ADD COLUMN IF NOT EXISTS period_number int     NOT NULL DEFAULT 1;
ALTER TABLE grades ADD COLUMN IF NOT EXISTS period_type   text    NOT NULL DEFAULT 'bimonthly';
ALTER TABLE grades ADD COLUMN IF NOT EXISTS weight        numeric NOT NULL DEFAULT 1;

-- 4. Colunas para tarefas com atraso
ALTER TABLE task_occurrences ADD COLUMN IF NOT EXISTS completed_late boolean NOT NULL DEFAULT false;
ALTER TABLE task_occurrences ADD COLUMN IF NOT EXISTS completed_at   timestamptz;
ALTER TABLE tasks            ADD COLUMN IF NOT EXISTS completed_late boolean NOT NULL DEFAULT false;
ALTER TABLE tasks            ADD COLUMN IF NOT EXISTS completed_at   timestamptz;

-- 5. Triggers de updated_at
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_sgs_upd ON school_grade_settings;
CREATE TRIGGER trg_sgs_upd
  BEFORE UPDATE ON school_grade_settings
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_sgp_upd ON school_grade_periods;
CREATE TRIGGER trg_sgp_upd
  BEFORE UPDATE ON school_grade_periods
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- 6. RLS — school_grade_settings
ALTER TABLE school_grade_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sgs_select" ON school_grade_settings;
DROP POLICY IF EXISTS "sgs_insert" ON school_grade_settings;
DROP POLICY IF EXISTS "sgs_update" ON school_grade_settings;
DROP POLICY IF EXISTS "sgs_delete" ON school_grade_settings;

CREATE POLICY "sgs_select" ON school_grade_settings FOR SELECT
  USING (family_id = (SELECT family_id FROM users WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "sgs_insert" ON school_grade_settings FOR INSERT WITH CHECK (
  family_id = (SELECT family_id FROM users WHERE id = auth.uid() LIMIT 1)
  AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) IN ('parent','master')
);
CREATE POLICY "sgs_update" ON school_grade_settings FOR UPDATE USING (
  family_id = (SELECT family_id FROM users WHERE id = auth.uid() LIMIT 1)
  AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) IN ('parent','master')
);
CREATE POLICY "sgs_delete" ON school_grade_settings FOR DELETE USING (
  family_id = (SELECT family_id FROM users WHERE id = auth.uid() LIMIT 1)
  AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) IN ('parent','master')
);

-- 7. RLS — school_grade_periods
ALTER TABLE school_grade_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sgp_select" ON school_grade_periods;
DROP POLICY IF EXISTS "sgp_insert" ON school_grade_periods;
DROP POLICY IF EXISTS "sgp_update" ON school_grade_periods;
DROP POLICY IF EXISTS "sgp_delete" ON school_grade_periods;

CREATE POLICY "sgp_select" ON school_grade_periods FOR SELECT
  USING (family_id = (SELECT family_id FROM users WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "sgp_insert" ON school_grade_periods FOR INSERT WITH CHECK (
  family_id = (SELECT family_id FROM users WHERE id = auth.uid() LIMIT 1)
  AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) IN ('parent','master')
);
CREATE POLICY "sgp_update" ON school_grade_periods FOR UPDATE USING (
  family_id = (SELECT family_id FROM users WHERE id = auth.uid() LIMIT 1)
  AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) IN ('parent','master')
);
CREATE POLICY "sgp_delete" ON school_grade_periods FOR DELETE USING (
  family_id = (SELECT family_id FROM users WHERE id = auth.uid() LIMIT 1)
  AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) IN ('parent','master')
);

-- 8. Índices de performance
CREATE INDEX IF NOT EXISTS idx_grades_period  ON grades (family_id, child_id, period_number);
CREATE INDEX IF NOT EXISTS idx_grades_subject ON grades (family_id, child_id, subject);
CREATE INDEX IF NOT EXISTS idx_sgp_child      ON school_grade_periods (family_id, child_id);

-- ============================================================
-- FIM DO SCRIPT
-- ============================================================
