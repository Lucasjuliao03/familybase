-- ==========================================
-- FAMILYBASE - MIGRATION SCRIPT PARA SUPABASE
-- Em produção / Vercel: depois de criar o projeto, execute também
--   supabase_baas_complete_fix.sql
-- (login, trigger auth→public.users, políticas master sem recursão RLS)
-- ==========================================

-- Habilita extensão pgcrypto para UUID se não estiver habilitada
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- TABELAS PRINCIPAIS
-- ==========================================

CREATE TABLE IF NOT EXISTS public.families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    language TEXT DEFAULT 'pt',
    plan TEXT DEFAULT 'free',
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'blocked', 'trial')),
    contact_email TEXT,
    contact_phone TEXT,
    logo_url TEXT,
    emoji TEXT,
    primary_color TEXT,
    secondary_color TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, -- Link direto com Supabase Auth
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'parent' CHECK(role IN ('master', 'parent', 'relative', 'child')),
    access_profile TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'blocked', 'pending')),
    phone TEXT,
    avatar_url TEXT,
    avatar_preset TEXT DEFAULT 'astronaut',
    emoji TEXT,
    display_color TEXT,
    family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
    language TEXT DEFAULT 'pt',
    must_change_password BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.children (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    nickname TEXT,
    age INTEGER,
    birthday DATE,
    avatar_url TEXT,
    avatar_preset TEXT DEFAULT 'explorer',
    color TEXT DEFAULT '#6C5CE7',
    emoji TEXT,
    user_id UUID UNIQUE REFERENCES public.users(id) ON DELETE SET NULL,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'blocked')),
    notes TEXT,
    points INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    xp_next_level INTEGER DEFAULT 100,
    streak_current INTEGER DEFAULT 0,
    streak_best INTEGER DEFAULT 0,
    streak_last_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'home' CHECK(type IN ('home', 'school', 'routine', 'challenge')),
    category TEXT,
    points INTEGER DEFAULT 10,
    coins INTEGER DEFAULT 0,
    frequency TEXT DEFAULT 'once' CHECK(frequency IN ('once', 'daily', 'weekly', 'monthly', 'custom')),
    recurrence_days TEXT,
    start_date DATE,
    end_date DATE,
    due_time TIME,
    deadline TIMESTAMP WITH TIME ZONE,
    is_recurring BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'draft')),
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    assignee_user_id UUID REFERENCES public.users(id),
    source_medication_id UUID,
    is_health_reminder BOOLEAN DEFAULT false,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    requires_approval BOOLEAN DEFAULT true,
    affects_allowance BOOLEAN DEFAULT false,
    visible_on_calendar BOOLEAN DEFAULT false,
    generate_notification BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.task_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    assignee_user_id UUID REFERENCES public.users(id),
    health_intake TEXT,
    health_confirmed_by UUID REFERENCES public.users(id),
    occurrence_date DATE NOT NULL,
    due_datetime TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'waiting_approval', 'completed', 'approved', 'rejected', 'delayed', 'expired', 'cancelled')),
    completed_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    points_awarded INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(task_id, child_id, occurrence_date)
);

CREATE TABLE IF NOT EXISTS public.task_allowance_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    affects_allowance BOOLEAN DEFAULT FALSE,
    bonus_amount NUMERIC DEFAULT 0,
    discount_amount NUMERIC DEFAULT 0,
    apply_discount_if_late BOOLEAN DEFAULT FALSE,
    UNIQUE (task_id)
);

CREATE TABLE IF NOT EXISTS public.rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    point_cost INTEGER DEFAULT 0,
    coin_cost INTEGER DEFAULT 0,
    type TEXT DEFAULT 'non_financial' CHECK(type IN ('financial', 'non_financial', 'surprise')),
    icon TEXT DEFAULT '🎁',
    available BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reward_id UUID NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    approved_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.allowance_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    model_type TEXT DEFAULT 'hybrid' CHECK(model_type IN ('fixed', 'accumulative', 'hybrid')),
    base_amount NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'BRL',
    cycle_closing_day INTEGER DEFAULT 30,
    payment_day INTEGER DEFAULT 5,
    allow_accumulation BOOLEAN DEFAULT true,
    allow_negative_balance BOOLEAN DEFAULT false,
    max_bonus NUMERIC DEFAULT 50,
    max_discount NUMERIC DEFAULT 50,
    require_parent_approval BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.allowance_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    opening_balance NUMERIC DEFAULT 0,
    base_amount NUMERIC DEFAULT 0,
    total_bonus NUMERIC DEFAULT 0,
    total_discount NUMERIC DEFAULT 0,
    manual_adjustments NUMERIC DEFAULT 0,
    final_amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'open' CHECK(status IN ('open', 'closed', 'paid', 'cancelled')),
    closed_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS public.allowance_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    cycle_id UUID REFERENCES public.allowance_cycles(id) ON DELETE SET NULL,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    task_occurrence_id UUID REFERENCES public.task_occurrences(id) ON DELETE SET NULL,
    reward_id UUID REFERENCES public.rewards(id) ON DELETE SET NULL,
    type TEXT CHECK(type IN ('credit', 'debit')),
    origin TEXT CHECK(origin IN ('task', 'reward', 'manual', 'payment', 'goal')),
    description TEXT,
    amount NUMERIC NOT NULL,
    balance_after NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'approved' CHECK(status IN ('pending', 'approved', 'rejected', 'paid')),
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_allowance_tx_task_occurrence_task_origin
    ON public.allowance_transactions(task_occurrence_id)
    WHERE task_occurrence_id IS NOT NULL AND origin = 'task';

CREATE TABLE IF NOT EXISTS public.savings_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    target_amount NUMERIC NOT NULL,
    current_amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.medals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_en TEXT,
    description TEXT,
    description_en TEXT,
    icon TEXT DEFAULT '🏅',
    category TEXT DEFAULT 'tasks' CHECK(category IN ('tasks', 'grades', 'streak', 'special', 'allowance')),
    requirement_type TEXT,
    requirement_value INTEGER DEFAULT 0,
    color TEXT,
    extra_points INTEGER DEFAULT 0,
    rule_description TEXT,
    medal_group TEXT,
    is_active BOOLEAN DEFAULT true,
    family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.earned_medals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medal_id UUID NOT NULL REFERENCES public.medals(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(medal_id, child_id)
);

CREATE TABLE IF NOT EXISTS public.health_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    patient_user_id UUID REFERENCES public.users(id),
    record_type TEXT NOT NULL,
    symptoms TEXT,
    temperature NUMERIC,
    severity TEXT DEFAULT 'mild' CHECK(severity IN ('mild','moderate','high')),
    status TEXT DEFAULT 'active' CHECK(status IN ('active','resolved','monitoring')),
    notes TEXT,
    medication_given TEXT,
    stayed_home BOOLEAN DEFAULT false,
    record_date DATE NOT NULL,
    record_time TIME,
    attachment_urls TEXT,
    created_by UUID NOT NULL REFERENCES public.users(id),
    inactive BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    patient_user_id UUID REFERENCES public.users(id),
    name TEXT NOT NULL,
    dosage TEXT,
    frequency TEXT,
    start_date DATE,
    end_date DATE,
    scheduled_time TIME,
    scheduled_times TEXT,
    notes TEXT,
    prescription_image_url TEXT,
    attachment_urls TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active','finished','suspended')),
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.family_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT false,
    enabled_at TIMESTAMP WITH TIME ZONE,
    disabled_at TIMESTAMP WITH TIME ZONE,
    updated_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(family_id, module_key)
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================

-- Função auxiliar para obter a family_id do usuário logado (SECURITY DEFINER evita recursão RLS)
CREATE OR REPLACE FUNCTION public.get_current_user_family_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT family_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_current_user_family_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_family_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_family_id() TO service_role;

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_allowance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowance_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earned_medals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_modules ENABLE ROW LEVEL SECURITY;

-- Policies para 'families' (Usuário só vê e edita a própria família)
CREATE POLICY "Users can view their own family" ON public.families FOR SELECT USING (id = public.get_current_user_family_id());
CREATE POLICY "Users can update their own family" ON public.families FOR UPDATE USING (id = public.get_current_user_family_id());

-- Policies genéricas baseadas em family_id
CREATE POLICY "Users can view family users" ON public.users FOR SELECT USING (family_id = public.get_current_user_family_id() OR id = auth.uid());
CREATE POLICY "Users can view family children" ON public.children FOR ALL USING (family_id = public.get_current_user_family_id());
CREATE POLICY "Users can view family tasks" ON public.tasks FOR ALL USING (family_id = public.get_current_user_family_id());
CREATE POLICY "Users can view family task_occurrences" ON public.task_occurrences FOR ALL USING (family_id = public.get_current_user_family_id());
CREATE POLICY "Users can view family task_allowance_rules" ON public.task_allowance_rules FOR ALL USING (
    EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_allowance_rules.task_id AND t.family_id = public.get_current_user_family_id())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_allowance_rules.task_id AND t.family_id = public.get_current_user_family_id())
);
CREATE POLICY "Users can view family rewards" ON public.rewards FOR ALL USING (family_id = public.get_current_user_family_id());
CREATE POLICY "Users can view family redemptions" ON public.redemptions FOR ALL USING (child_id IN (SELECT id FROM public.children WHERE family_id = public.get_current_user_family_id()));
CREATE POLICY "Users can view family allowance" ON public.allowance_settings FOR ALL USING (family_id = public.get_current_user_family_id());
CREATE POLICY "Users can view family allowance_cycles" ON public.allowance_cycles FOR ALL USING (family_id = public.get_current_user_family_id());
CREATE POLICY "Users can view family allowance_transactions" ON public.allowance_transactions FOR ALL USING (family_id = public.get_current_user_family_id());
CREATE POLICY "Users can view family savings_goals" ON public.savings_goals FOR ALL USING (family_id = public.get_current_user_family_id());
CREATE POLICY "Users can view family medals" ON public.medals FOR ALL USING (family_id IS NULL OR family_id = public.get_current_user_family_id());
CREATE POLICY "Users can view family earned_medals" ON public.earned_medals FOR ALL USING (child_id IN (SELECT id FROM public.children WHERE family_id = public.get_current_user_family_id()));
CREATE POLICY "Users can view family health_records" ON public.health_records FOR ALL USING (family_id = public.get_current_user_family_id());
CREATE POLICY "Users can view family medications" ON public.medications FOR ALL USING (family_id = public.get_current_user_family_id());
CREATE POLICY "Users can view family_modules" ON public.family_modules FOR ALL USING (family_id = public.get_current_user_family_id());

-- Trigger para atualizar `updated_at` (exemplo para tasks, adicionar em todas depois)
CREATE OR REPLACE FUNCTION update_modified_column()   
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;   
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tasks_modtime BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_users_modtime BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_families_modtime BEFORE UPDATE ON public.families FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- ==========================================
-- STORAGE E POLICIES
-- ==========================================

INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('family-images', 'family-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('health-files', 'health-files', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('reward-images', 'reward-images', true) ON CONFLICT DO NOTHING;

-- Policy para avatars: qualquer um logado pode ver, só o próprio usuario atualiza
CREATE POLICY "Avatars are public" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload their own avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Health files are private" ON storage.objects FOR SELECT USING (bucket_id = 'health-files' AND auth.role() = 'authenticated');
CREATE POLICY "Users can upload health files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'health-files' AND auth.role() = 'authenticated');

-- etc...
