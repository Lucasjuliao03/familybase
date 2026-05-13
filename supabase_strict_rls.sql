-- ==============================================================================
-- FAMILYBASE - POLÍTICAS DE SEGURANÇA ESTRITAS (RLS) PARA ARQUITETURA FRONTEND-ONLY
-- ==============================================================================

-- 1. Helper Function para pegar o ID da família do usuário logado de forma otimizada
CREATE OR REPLACE FUNCTION public.get_current_user_family_id()
RETURNS UUID AS $$
  SELECT family_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 2. Ativar RLS em TODAS as tabelas principais
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- USERS
-- ==========================================
DROP POLICY IF EXISTS "Users view family members" ON public.users;
CREATE POLICY "Users view family members" ON public.users 
FOR SELECT USING (family_id = public.get_current_user_family_id() OR id = auth.uid());

DROP POLICY IF EXISTS "Users update themselves" ON public.users;
CREATE POLICY "Users update themselves" ON public.users 
FOR UPDATE USING (id = auth.uid());

-- ==========================================
-- CHILDREN
-- ==========================================
DROP POLICY IF EXISTS "Family view children" ON public.children;
CREATE POLICY "Family view children" ON public.children 
FOR SELECT USING (family_id = public.get_current_user_family_id());

DROP POLICY IF EXISTS "Parents manage children" ON public.children;
CREATE POLICY "Parents manage children" ON public.children 
FOR ALL USING (
    family_id = public.get_current_user_family_id() AND 
    public.get_current_user_role() = 'parent'
);

-- ==========================================
-- FAMILIES
-- ==========================================
DROP POLICY IF EXISTS "Family members view family data" ON public.families;
CREATE POLICY "Family members view family data" ON public.families 
FOR SELECT USING (id = public.get_current_user_family_id());

-- ==========================================
-- TASKS
-- ==========================================
DROP POLICY IF EXISTS "Family view tasks" ON public.tasks;
CREATE POLICY "Family view tasks" ON public.tasks 
FOR SELECT USING (family_id = public.get_current_user_family_id());

DROP POLICY IF EXISTS "Parents manage tasks" ON public.tasks;
CREATE POLICY "Parents manage tasks" ON public.tasks 
FOR ALL USING (
    family_id = public.get_current_user_family_id() AND 
    public.get_current_user_role() = 'parent'
);

-- ==========================================
-- TASK_OCCURRENCES
-- ==========================================
DROP POLICY IF EXISTS "Family view occurrences" ON public.task_occurrences;
CREATE POLICY "Family view occurrences" ON public.task_occurrences 
FOR SELECT USING (family_id = public.get_current_user_family_id());

DROP POLICY IF EXISTS "Children update own occurrences status" ON public.task_occurrences;
CREATE POLICY "Children update own occurrences status" ON public.task_occurrences 
FOR UPDATE USING (
    family_id = public.get_current_user_family_id() AND 
    (
        public.get_current_user_role() = 'parent' 
        OR 
        (public.get_current_user_role() = 'child' AND child_id = (SELECT id FROM children WHERE user_id = auth.uid()))
    )
);

-- ==========================================
-- GRADES
-- ==========================================
DROP POLICY IF EXISTS "View grades" ON public.grades;
CREATE POLICY "View grades" ON public.grades 
FOR SELECT USING (
    family_id = public.get_current_user_family_id() AND
    (
        public.get_current_user_role() = 'parent' OR
        child_id = (SELECT id FROM children WHERE user_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Insert grades" ON public.grades;
CREATE POLICY "Insert grades" ON public.grades 
FOR INSERT WITH CHECK (
    family_id = public.get_current_user_family_id() AND
    (
        public.get_current_user_role() = 'parent' OR
        child_id = (SELECT id FROM children WHERE user_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Delete grades" ON public.grades;
CREATE POLICY "Delete grades" ON public.grades 
FOR DELETE USING (
    family_id = public.get_current_user_family_id() AND
    public.get_current_user_role() = 'parent'
);

-- ==========================================
-- SHOPPING LIST
-- ==========================================
DROP POLICY IF EXISTS "Family manage shopping list" ON public.shopping_list;
CREATE POLICY "Family manage shopping list" ON public.shopping_list 
FOR ALL USING (family_id = public.get_current_user_family_id());

-- ==========================================
-- CALENDAR
-- ==========================================
DROP POLICY IF EXISTS "Family view calendar" ON public.calendar_events;
CREATE POLICY "Family view calendar" ON public.calendar_events 
FOR SELECT USING (family_id = public.get_current_user_family_id());

DROP POLICY IF EXISTS "Family insert calendar" ON public.calendar_events;
CREATE POLICY "Family insert calendar" ON public.calendar_events 
FOR INSERT WITH CHECK (family_id = public.get_current_user_family_id());

-- ==========================================
-- STORAGE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated can read uploads" ON storage.objects;
CREATE POLICY "Authenticated can read uploads" ON storage.objects 
FOR SELECT USING (bucket_id = 'uploads' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can upload" ON storage.objects;
CREATE POLICY "Authenticated can upload" ON storage.objects 
FOR INSERT WITH CHECK (bucket_id = 'uploads' AND auth.role() = 'authenticated');
