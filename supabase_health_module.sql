-- Cria as tabelas do módulo de Saúde que ainda não existiam no Supabase

CREATE TABLE IF NOT EXISTS public.health_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    doctor_name TEXT,
    specialty TEXT,
    date DATE NOT NULL,
    time TIME,
    location TEXT,
    notes TEXT,
    status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.health_medication_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
    taken_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'taken' CHECK(status IN ('taken', 'skipped', 'late')),
    notes TEXT,
    logged_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Políticas de Segurança (RLS)
ALTER TABLE public.health_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_medication_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can view family health_appointments" ON public.health_appointments;
    DROP POLICY IF EXISTS "Users can manage family health_appointments" ON public.health_appointments;
    DROP POLICY IF EXISTS "Users can view family health_medication_logs" ON public.health_medication_logs;
    DROP POLICY IF EXISTS "Users can manage family health_medication_logs" ON public.health_medication_logs;
EXCEPTION WHEN OTHERS THEN
END
$$;

CREATE POLICY "Users can view family health_appointments" ON public.health_appointments FOR SELECT USING (family_id = public.get_current_user_family_id());
CREATE POLICY "Users can manage family health_appointments" ON public.health_appointments FOR ALL USING (family_id = public.get_current_user_family_id() AND public.get_current_user_role() = 'parent');

CREATE POLICY "Users can view family health_medication_logs" ON public.health_medication_logs FOR SELECT USING (family_id = public.get_current_user_family_id());
CREATE POLICY "Users can manage family health_medication_logs" ON public.health_medication_logs FOR ALL USING (family_id = public.get_current_user_family_id() AND public.get_current_user_role() = 'parent');
