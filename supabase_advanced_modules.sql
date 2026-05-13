-- ==============================================================================
-- FAMILYBASE - TABELAS DE MÓDULOS AVANÇADOS (MESADA, METAS E LOJA)
-- ==============================================================================

-- 1. TABELAS DE MESADA (ALLOWANCE)
CREATE TABLE IF NOT EXISTS public.allowance_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  model_type TEXT NOT NULL DEFAULT 'hybrid',
  base_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  cycle_closing_day INTEGER NOT NULL DEFAULT 30,
  payment_day INTEGER NOT NULL DEFAULT 5,
  allow_accumulation INTEGER NOT NULL DEFAULT 1,
  allow_negative_balance INTEGER NOT NULL DEFAULT 0,
  max_bonus NUMERIC(10,2) NOT NULL DEFAULT 50,
  max_discount NUMERIC(10,2) NOT NULL DEFAULT 50,
  require_parent_approval INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (family_id, child_id)
);

CREATE TABLE IF NOT EXISTS public.allowance_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  child_name TEXT,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open, closed, paid
  opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  base_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_bonus NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  manual_adjustments NUMERIC(10,2) NOT NULL DEFAULT 0,
  final_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.allowance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES public.allowance_cycles(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- credit, debit
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PORQUINHO E METAS (PIGGY BANK / GOALS)
CREATE TABLE IF NOT EXISTS public.piggy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  child_name TEXT,
  goal_title TEXT,
  requested_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  current_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. RESGATES NA LOJA DA FAMÍLIA (REWARDS)
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  reward_id UUID,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ==============================================================================
-- APLICAÇÃO DE RLS (ROW LEVEL SECURITY)
-- ==============================================================================

ALTER TABLE public.allowance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowance_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.piggy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

-- ALLOWANCE SETTINGS
DROP POLICY IF EXISTS "Family view allowance settings" ON public.allowance_settings;
CREATE POLICY "Family view allowance settings" ON public.allowance_settings FOR SELECT USING (family_id = public.get_current_user_family_id());

DROP POLICY IF EXISTS "Parents manage allowance settings" ON public.allowance_settings;
CREATE POLICY "Parents manage allowance settings" ON public.allowance_settings FOR ALL USING (family_id = public.get_current_user_family_id() AND public.get_current_user_role() = 'parent');

-- ALLOWANCE CYCLES
DROP POLICY IF EXISTS "Family view allowance cycles" ON public.allowance_cycles;
CREATE POLICY "Family view allowance cycles" ON public.allowance_cycles FOR SELECT USING (family_id = public.get_current_user_family_id());

DROP POLICY IF EXISTS "Parents manage allowance cycles" ON public.allowance_cycles;
CREATE POLICY "Parents manage allowance cycles" ON public.allowance_cycles FOR ALL USING (family_id = public.get_current_user_family_id() AND public.get_current_user_role() = 'parent');

-- ALLOWANCE TRANSACTIONS
DROP POLICY IF EXISTS "Family view allowance transactions" ON public.allowance_transactions;
CREATE POLICY "Family view allowance transactions" ON public.allowance_transactions FOR SELECT USING (family_id = public.get_current_user_family_id());

DROP POLICY IF EXISTS "Parents manage allowance transactions" ON public.allowance_transactions;
CREATE POLICY "Parents manage allowance transactions" ON public.allowance_transactions FOR ALL USING (family_id = public.get_current_user_family_id() AND public.get_current_user_role() = 'parent');

-- PIGGY REQUESTS
DROP POLICY IF EXISTS "Family view piggy requests" ON public.piggy_requests;
CREATE POLICY "Family view piggy requests" ON public.piggy_requests FOR SELECT USING (family_id = public.get_current_user_family_id());

DROP POLICY IF EXISTS "Parents manage piggy requests" ON public.piggy_requests;
CREATE POLICY "Parents manage piggy requests" ON public.piggy_requests FOR ALL USING (family_id = public.get_current_user_family_id() AND public.get_current_user_role() = 'parent');

-- GOALS
DROP POLICY IF EXISTS "Family view goals" ON public.goals;
CREATE POLICY "Family view goals" ON public.goals FOR SELECT USING (family_id = public.get_current_user_family_id());

DROP POLICY IF EXISTS "Family manage goals" ON public.goals;
CREATE POLICY "Family manage goals" ON public.goals FOR ALL USING (family_id = public.get_current_user_family_id());

-- REWARD REDEMPTIONS
DROP POLICY IF EXISTS "Family view reward redemptions" ON public.reward_redemptions;
CREATE POLICY "Family view reward redemptions" ON public.reward_redemptions FOR SELECT USING (family_id = public.get_current_user_family_id());

DROP POLICY IF EXISTS "Family manage reward redemptions" ON public.reward_redemptions;
CREATE POLICY "Family manage reward redemptions" ON public.reward_redemptions FOR ALL USING (family_id = public.get_current_user_family_id());
