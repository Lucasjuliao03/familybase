-- ==========================================
-- FAMILYBASE - TABELAS COMPLEMENTARES
-- Execute este script no SQL Editor do Supabase
-- DEPOIS de rodar supabase.sql e supabase_backend_tables.sql
-- ==========================================

-- Habilita pg_cron para cron jobs (execute como superuser se necessário)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ==========================================
-- NOTAS ESCOLARES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject TEXT NOT NULL,
    type TEXT DEFAULT 'test' CHECK(type IN ('test', 'assignment', 'exam', 'quiz', 'other')),
    score NUMERIC,
    max_score NUMERIC DEFAULT 10,
    concept TEXT,
    observation TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- NOTIFICAÇÕES INTERNAS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'info' CHECK(type IN ('info', 'success', 'warning', 'error', 'achievement', 'task', 'grade', 'allowance')),
    icon TEXT DEFAULT '🔔',
    is_read BOOLEAN DEFAULT false,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    child_id UUID REFERENCES public.children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    related_module TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- LOGS DE AUDITORIA
-- ==========================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    role TEXT,
    module TEXT,
    action TEXT NOT NULL,
    description TEXT,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- PUSH NOTIFICATIONS (Web Push)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    subscription JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- CALENDÁRIO FAMILIAR
-- ==========================================
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    time TIME,
    end_date DATE,
    type TEXT DEFAULT 'family' CHECK(type IN ('family', 'school', 'medical', 'birthday', 'activity', 'task', 'reminder', 'other')),
    color TEXT DEFAULT '#6C5CE7',
    child_id UUID REFERENCES public.children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    visible_to_child BOOLEAN DEFAULT true,
    visibility TEXT DEFAULT 'family' CHECK(visibility IN ('family', 'private', 'child')),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- LISTA DE COMPRAS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.shopping_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    quantity TEXT,
    establishment TEXT,
    price NUMERIC DEFAULT 0,
    is_urgent BOOLEAN DEFAULT false,
    is_bought BOOLEAN DEFAULT false,
    registered_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    bought_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    bought_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- MURAL FAMILIAR (avisos)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.family_notices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'notice' CHECK(type IN ('notice', 'reminder', 'event', 'quick_task', 'poll', 'achievement')),
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived', 'cancelled')),
    target_type TEXT DEFAULT 'all' CHECK(target_type IN ('all', 'parents', 'child', 'relative', 'selected')),
    target_user_ids JSONB DEFAULT '[]'::jsonb,
    target_child_ids JSONB DEFAULT '[]'::jsonb,
    start_datetime TIMESTAMP WITH TIME ZONE,
    due_datetime TIMESTAMP WITH TIME ZONE,
    notice_time TIME,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_rule TEXT,
    is_pinned BOOLEAN DEFAULT false,
    requires_read_confirmation BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- LEITURAS DE AVISOS DO MURAL
-- ==========================================
CREATE TABLE IF NOT EXISTS public.notice_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notice_id UUID NOT NULL REFERENCES public.family_notices(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(notice_id, user_id)
);

-- ==========================================
-- HISTÓRICO DE PONTOS/XP (gamificação)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    type TEXT DEFAULT 'task' CHECK(type IN ('task', 'grade', 'medal', 'allowance', 'bonus', 'penalty', 'other')),
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- COLUNA password NA TABELA USERS (fallback bcrypt)
-- Necessária enquanto existirem usuários com login local
-- Pode ser removida depois de migrar todos para Supabase Auth
-- ==========================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password TEXT;

-- ==========================================
-- ÍNDICES DE PERFORMANCE
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_grades_child ON public.grades(child_id);
CREATE INDEX IF NOT EXISTS idx_grades_family ON public.grades(family_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_child ON public.notifications(child_id);
CREATE INDEX IF NOT EXISTS idx_notifications_family ON public.notifications(family_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_family ON public.calendar_events(family_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON public.calendar_events(date);
CREATE INDEX IF NOT EXISTS idx_shopping_list_family ON public.shopping_list(family_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_is_bought ON public.shopping_list(is_bought);
CREATE INDEX IF NOT EXISTS idx_family_notices_family ON public.family_notices(family_id);
CREATE INDEX IF NOT EXISTS idx_family_notices_status ON public.family_notices(status);
CREATE INDEX IF NOT EXISTS idx_notice_reads_notice ON public.notice_reads(notice_id);
CREATE INDEX IF NOT EXISTS idx_history_child ON public.history(child_id);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) NAS NOVAS TABELAS
-- ==========================================
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history ENABLE ROW LEVEL SECURITY;

-- Policies para grades
CREATE POLICY "Family can access grades" ON public.grades FOR ALL USING (family_id = public.get_current_user_family_id());

-- Policies para notifications
CREATE POLICY "Users can see their notifications" ON public.notifications FOR SELECT USING (
    family_id = public.get_current_user_family_id() AND (
        user_id = auth.uid() OR user_id IS NULL OR
        child_id IN (SELECT id FROM public.children WHERE family_id = public.get_current_user_family_id())
    )
);
CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT WITH CHECK (family_id = public.get_current_user_family_id());
CREATE POLICY "Users can update their notifications" ON public.notifications FOR UPDATE USING (family_id = public.get_current_user_family_id());

-- Policies para audit_logs (apenas leitura master)
CREATE POLICY "Only master can read audit logs" ON public.audit_logs FOR SELECT USING (auth.uid() IN (SELECT id FROM public.users WHERE role = 'master'));
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- Policies para push_subscriptions
CREATE POLICY "Users manage own push subscriptions" ON public.push_subscriptions FOR ALL USING (user_id = auth.uid());

-- Policies para calendar_events
CREATE POLICY "Family can access calendar events" ON public.calendar_events FOR ALL USING (family_id = public.get_current_user_family_id());

-- Policies para shopping_list
CREATE POLICY "Family can access shopping list" ON public.shopping_list FOR ALL USING (family_id = public.get_current_user_family_id());

-- Policies para family_notices
CREATE POLICY "Family can access notices" ON public.family_notices FOR ALL USING (family_id = public.get_current_user_family_id());

-- Policies para notice_reads
CREATE POLICY "Family can access notice reads" ON public.notice_reads FOR ALL USING (
    notice_id IN (SELECT id FROM public.family_notices WHERE family_id = public.get_current_user_family_id())
);

-- Policies para history
CREATE POLICY "Family can access history" ON public.history FOR ALL USING (family_id = public.get_current_user_family_id());

-- ==========================================
-- TRIGGERS updated_at NAS NOVAS TABELAS
-- ==========================================
CREATE TRIGGER update_grades_modtime BEFORE UPDATE ON public.grades FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_calendar_events_modtime BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_shopping_list_modtime BEFORE UPDATE ON public.shopping_list FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_family_notices_modtime BEFORE UPDATE ON public.family_notices FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- ==========================================
-- SUPABASE STORAGE BUCKETS
-- ==========================================
INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('mural', 'mural', false) ON CONFLICT DO NOTHING;

CREATE POLICY "Authenticated can read uploads" ON storage.objects FOR SELECT USING (bucket_id = 'uploads' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated can upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'uploads' AND auth.role() = 'authenticated');

-- ==========================================
-- pg_cron: GERAÇÃO AUTOMÁTICA DE TAREFAS RECORRENTES
-- (Habilite pg_cron nas extensões do Supabase primeiro)
-- ==========================================
-- SELECT cron.schedule('familybase-daily-tasks', '0 0 * * *', $$
--   UPDATE public.task_occurrences
--   SET status = 'expired', updated_at = now()
--   WHERE status IN ('pending', 'delayed', 'in_progress')
--   AND occurrence_date < CURRENT_DATE;
-- $$);
