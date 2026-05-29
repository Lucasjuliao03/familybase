-- 1. Criar a tabela subjects
CREATE TABLE IF NOT EXISTS public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE (family_id, name)
);

-- Habilitar RLS
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "subjects_parents_family_all" ON public.subjects;
CREATE POLICY "subjects_parents_family_all" ON public.subjects
    FOR ALL
    USING (family_id = public.get_current_user_family_id());

-- 2. Modificar tabela grades para compatibilidade e novas chaves
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL;
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS bimestre INT;
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS nota NUMERIC;
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS aluno_id UUID REFERENCES public.children(id) ON DELETE CASCADE;

-- 3. Migrar dados existentes de grades para subjects
-- Inserir matérias únicas
INSERT INTO public.subjects (name, family_id)
SELECT DISTINCT trim(subject), family_id FROM public.grades
ON CONFLICT (family_id, name) DO NOTHING;

-- Associar subject_id nas notas
UPDATE public.grades g
SET subject_id = s.id
FROM public.subjects s
WHERE g.family_id = s.family_id AND lower(trim(g.subject)) = lower(trim(s.name));

-- Preencher colunas novas
UPDATE public.grades SET
  aluno_id = child_id,
  bimestre = period_number,
  nota = score
WHERE aluno_id IS NULL OR bimestre IS NULL OR nota IS NULL;

-- 4. Função e trigger para manter compatibilidade bidirecional em grades
CREATE OR REPLACE FUNCTION public.sync_grades_compat_columns()
RETURNS TRIGGER AS $$
DECLARE
  v_sub_id UUID;
  v_sub_name TEXT;
BEGIN
  -- Sincronizar aluno_id / child_id
  IF NEW.aluno_id IS NULL AND NEW.child_id IS NOT NULL THEN
    NEW.aluno_id := NEW.child_id;
  ELSIF NEW.child_id IS NULL AND NEW.aluno_id IS NOT NULL THEN
    NEW.child_id := NEW.aluno_id;
  END IF;

  -- Sincronizar period_number / bimestre
  IF NEW.bimestre IS NULL AND NEW.period_number IS NOT NULL THEN
    NEW.bimestre := NEW.period_number;
  ELSIF NEW.period_number IS NULL AND NEW.bimestre IS NOT NULL THEN
    NEW.period_number := NEW.bimestre;
  END IF;

  -- Sincronizar score / nota
  IF NEW.nota IS NULL AND NEW.score IS NOT NULL THEN
    NEW.nota := NEW.score;
  ELSIF NEW.score IS NULL AND NEW.nota IS NOT NULL THEN
    NEW.score := NEW.nota;
  END IF;

  -- Sincronizar subject / subject_id
  IF NEW.subject_id IS NULL AND NEW.subject IS NOT NULL THEN
    -- Achar ou criar a matéria na família correspondente (busca case-insensitive)
    SELECT id, name INTO v_sub_id, v_sub_name FROM public.subjects 
    WHERE family_id = NEW.family_id AND lower(trim(name)) = lower(trim(NEW.subject))
    LIMIT 1;
    
    IF v_sub_id IS NULL THEN
      INSERT INTO public.subjects (name, family_id) VALUES (trim(NEW.subject), NEW.family_id) RETURNING id, name INTO v_sub_id, v_sub_name;
    END IF;
    NEW.subject_id := v_sub_id;
    NEW.subject := v_sub_name;
  ELSIF NEW.subject_id IS NOT NULL THEN
    -- Preencher a coluna subject com o nome da tabela subjects
    SELECT name INTO NEW.subject FROM public.subjects WHERE id = NEW.subject_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_grades_compat ON public.grades;
CREATE TRIGGER trg_sync_grades_compat
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.sync_grades_compat_columns();
