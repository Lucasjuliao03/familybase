-- ============================================================
-- Supabase: Configurações de Avaliação Escolar + Ajustes em Grades
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- 1. Tabela de configuração do modelo de avaliação por aluno
CREATE TABLE IF NOT EXISTS school_grade_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  evaluation_model text NOT NULL DEFAULT 'bimonthly', -- 'bimonthly' (4 bimestres) | 'trimester' (3 trimestres)
  periods_count   int NOT NULL DEFAULT 4,
  annual_total_points numeric NOT NULL DEFAULT 100,
  period_total_points numeric NOT NULL DEFAULT 25,
  minimum_average numeric NOT NULL DEFAULT 6,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, child_id)
);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_school_grade_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_school_grade_settings_updated_at ON school_grade_settings;
CREATE TRIGGER trg_school_grade_settings_updated_at
  BEFORE UPDATE ON school_grade_settings
  FOR EACH ROW EXECUTE FUNCTION update_school_grade_settings_updated_at();

-- 2. Colunas de período nas notas (idempotente)
ALTER TABLE grades ADD COLUMN IF NOT EXISTS period_number int NOT NULL DEFAULT 1;
ALTER TABLE grades ADD COLUMN IF NOT EXISTS period_type   text NOT NULL DEFAULT 'bimonthly';

-- 3. RLS
ALTER TABLE school_grade_settings ENABLE ROW LEVEL SECURITY;

-- Drop políticas antigas se existirem
DROP POLICY IF EXISTS "sgs_family_select" ON school_grade_settings;
DROP POLICY IF EXISTS "sgs_family_insert" ON school_grade_settings;
DROP POLICY IF EXISTS "sgs_family_update" ON school_grade_settings;
DROP POLICY IF EXISTS "sgs_family_delete" ON school_grade_settings;

-- Política: qualquer membro da família pode ler; apenas parent/master pode modificar
CREATE POLICY "sgs_family_select" ON school_grade_settings
  FOR SELECT USING (
    family_id = (SELECT family_id FROM users WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "sgs_family_insert" ON school_grade_settings
  FOR INSERT WITH CHECK (
    family_id = (SELECT family_id FROM users WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) IN ('parent', 'master')
  );

CREATE POLICY "sgs_family_update" ON school_grade_settings
  FOR UPDATE USING (
    family_id = (SELECT family_id FROM users WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) IN ('parent', 'master')
  );

CREATE POLICY "sgs_family_delete" ON school_grade_settings
  FOR DELETE USING (
    family_id = (SELECT family_id FROM users WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) IN ('parent', 'master')
  );

-- 4. Atualizar coluna completed_late em task_occurrences (para suporte a "concluída com atraso")
ALTER TABLE task_occurrences ADD COLUMN IF NOT EXISTS completed_late boolean NOT NULL DEFAULT false;
ALTER TABLE task_occurrences ADD COLUMN IF NOT EXISTS completed_at   timestamptz;

-- 5. Atualizar coluna completed_late em tasks (tarefas únicas)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_late boolean NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at   timestamptz;

-- 6. Índices para performance nas consultas de notas por período
CREATE INDEX IF NOT EXISTS idx_grades_period ON grades (family_id, child_id, period_number, period_type);
CREATE INDEX IF NOT EXISTS idx_grades_subject ON grades (family_id, child_id, subject);

-- ============================================================
-- FIM DO SCRIPT
-- ============================================================
