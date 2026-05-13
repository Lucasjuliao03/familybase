-- Alinhamento Saúde + mesada/políticas para BaaS (Supabase REST)
-- Execute no SQL Editor depois de supabase.sql e supabase_missing_tables.sql / health_module.

-- health_records: permitir registo só de adulto (patient_user_id) sem criança obrigatória
ALTER TABLE public.health_records
  ALTER COLUMN child_id DROP NOT NULL;

-- medications / health_appointments: mesmo para adultos
ALTER TABLE public.medications
  ALTER COLUMN child_id DROP NOT NULL;

ALTER TABLE public.health_medication_logs
  ALTER COLUMN child_id DROP NOT NULL;

-- Colunas extra em consultas (UI antiga Node / HealthCenter)
ALTER TABLE public.health_appointments
  ADD COLUMN IF NOT EXISTS patient_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Políticas health_* sem função inexistente get_current_user_role()
DROP POLICY IF EXISTS "Users can manage family health_appointments" ON public.health_appointments;
CREATE POLICY "Users can manage family health_appointments"
  ON public.health_appointments FOR ALL
  USING (
    family_id = public.get_current_user_family_id()
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('parent', 'relative')
  )
  WITH CHECK (
    family_id = public.get_current_user_family_id()
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('parent', 'relative')
  );

DROP POLICY IF EXISTS "Users can manage family health_medication_logs" ON public.health_medication_logs;
CREATE POLICY "Users can manage family health_medication_logs"
  ON public.health_medication_logs FOR ALL
  USING (
    family_id = public.get_current_user_family_id()
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('parent', 'relative')
  )
  WITH CHECK (
    family_id = public.get_current_user_family_id()
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('parent', 'relative')
  );

-- notice_reads: INSERT/UPDATE explícitos (FOR ALL só USING falha em alguns PG)
DROP POLICY IF EXISTS "Family can access notice reads" ON public.notice_reads;
CREATE POLICY "notice_reads_select" ON public.notice_reads FOR SELECT
  USING (
    notice_id IN (SELECT id FROM public.family_notices WHERE family_id = public.get_current_user_family_id())
  );
CREATE POLICY "notice_reads_insert" ON public.notice_reads FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND notice_id IN (SELECT id FROM public.family_notices WHERE family_id = public.get_current_user_family_id())
  );
CREATE POLICY "notice_reads_update" ON public.notice_reads FOR UPDATE
  USING (
    user_id = auth.uid()
    AND notice_id IN (SELECT id FROM public.family_notices WHERE family_id = public.get_current_user_family_id())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND notice_id IN (SELECT id FROM public.family_notices WHERE family_id = public.get_current_user_family_id())
  );
CREATE POLICY "notice_reads_delete" ON public.notice_reads FOR DELETE
  USING (
    user_id = auth.uid()
    AND notice_id IN (SELECT id FROM public.family_notices WHERE family_id = public.get_current_user_family_id())
  );
