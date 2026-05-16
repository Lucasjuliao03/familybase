-- =============================================================================
-- FamilyBase — Patch: Cadastro de membros sem Edge Function
-- Execute no Supabase → SQL Editor (pode executar várias vezes).
-- Depende de: supabase.sql, supabase_baas_complete_fix.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) RPC: add_member_to_family
--    Permite que um responsável (parent) adicione qualquer utilizador à família.
--    Usa SECURITY DEFINER para ultrapassar a RLS do UPDATE em public.users.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_member_to_family(
  p_target_user_id   uuid,
  p_family_id        uuid,
  p_role             text    DEFAULT 'relative',
  p_name             text    DEFAULT NULL,
  p_must_change_password boolean DEFAULT false,
  p_relationship     text    DEFAULT NULL,
  p_access_profile   text    DEFAULT NULL,
  p_phone            text    DEFAULT NULL,
  p_emoji            text    DEFAULT NULL,
  p_display_color    text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_fid  uuid;
  v_caller_role text;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT family_id, role INTO v_caller_fid, v_caller_role
  FROM public.users WHERE id = v_caller_uid;

  -- Só parents e masters podem adicionar membros
  IF v_caller_role NOT IN ('parent', 'master') THEN
    RAISE EXCEPTION 'permission_denied: apenas responsáveis podem adicionar membros';
  END IF;

  -- O parent só pode adicionar à sua própria família
  IF v_caller_role = 'parent' AND v_caller_fid != p_family_id THEN
    RAISE EXCEPTION 'family_mismatch: não pode adicionar membros a outra família';
  END IF;

  -- Valida role
  IF p_role NOT IN ('parent', 'relative', 'child') THEN
    RAISE EXCEPTION 'invalid_role: use parent, relative ou child';
  END IF;

  -- Aguarda que o trigger on_auth_user_created já criou a linha (timing safety)
  -- Tenta inserir linha mínima se ainda não existir (caso raro)
  INSERT INTO public.users (id, name, email, role, family_id, status, must_change_password)
  SELECT
    p_target_user_id,
    COALESCE(p_name, split_part((SELECT email::text FROM auth.users WHERE id = p_target_user_id), '@', 1), 'Utilizador'),
    (SELECT email::text FROM auth.users WHERE id = p_target_user_id),
    p_role,
    p_family_id,
    'active',
    p_must_change_password
  WHERE NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_target_user_id)
  ON CONFLICT (id) DO NOTHING;

  -- Atualiza o perfil do novo utilizador
  UPDATE public.users SET
    name                 = COALESCE(NULLIF(trim(p_name), ''), name),
    role                 = p_role,
    family_id            = p_family_id,
    must_change_password = p_must_change_password,
    access_profile       = COALESCE(p_access_profile, access_profile),
    phone                = COALESCE(p_phone, phone),
    emoji                = COALESCE(p_emoji, emoji),
    display_color        = COALESCE(p_display_color, display_color),
    status               = 'active',
    updated_at           = now()
  WHERE id = p_target_user_id;

  -- Se fornecido, regista relação em family_members (para parentes)
  IF p_relationship IS NOT NULL THEN
    INSERT INTO public.family_members (id, family_id, user_id, relationship)
    VALUES (gen_random_uuid(), p_family_id, p_target_user_id, p_relationship)
    ON CONFLICT (family_id, user_id) DO UPDATE SET relationship = p_relationship;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_target_user_id,
    'family_id', p_family_id,
    'role', p_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_member_to_family(uuid, uuid, text, text, boolean, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_member_to_family(uuid, uuid, text, text, boolean, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_member_to_family(uuid, uuid, text, text, boolean, text, text, text, text, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 2) RLS para family_members e relative_children (não tinham políticas)
-- -----------------------------------------------------------------------------

-- family_members
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Family members can view own family links" ON public.family_members;
CREATE POLICY "Family members can view own family links"
  ON public.family_members FOR SELECT
  USING (family_id = public.get_current_user_family_id());

DROP POLICY IF EXISTS "Parents manage family members links" ON public.family_members;
CREATE POLICY "Parents manage family members links"
  ON public.family_members FOR ALL
  USING (family_id = public.get_current_user_family_id())
  WITH CHECK (family_id = public.get_current_user_family_id());

-- relative_children
ALTER TABLE public.relative_children ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Family can view relative_children" ON public.relative_children;
CREATE POLICY "Family can view relative_children"
  ON public.relative_children FOR SELECT
  USING (family_id = public.get_current_user_family_id());

DROP POLICY IF EXISTS "Parents manage relative_children" ON public.relative_children;
CREATE POLICY "Parents manage relative_children"
  ON public.relative_children FOR ALL
  USING (family_id = public.get_current_user_family_id())
  WITH CHECK (family_id = public.get_current_user_family_id());

-- -----------------------------------------------------------------------------
-- 3) Garante que parents podem fazer INSERT em children (caso a policy não exista)
-- -----------------------------------------------------------------------------

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'children' AND policyname = 'Parents manage children'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Parents manage children" ON public.children
      FOR ALL USING (
        family_id = public.get_current_user_family_id()
      )
      WITH CHECK (
        family_id = public.get_current_user_family_id()
      );
    $p$;
  END IF;
END
$do$;

-- -----------------------------------------------------------------------------
-- 4) RPC: change_member_password
--    Permite que um responsável altere a senha de outro membro da família
--    sem precisar de Edge Function — usa SECURITY DEFINER para aceder a auth.users.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.change_member_password(
  p_target_user_id uuid,
  p_new_password   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_role text;
  v_caller_fid  uuid;
  v_target_fid  uuid;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role, family_id INTO v_caller_role, v_caller_fid
  FROM public.users WHERE id = v_caller_uid;

  IF v_caller_role NOT IN ('parent', 'master') THEN
    RAISE EXCEPTION 'permission_denied: apenas responsáveis podem alterar senhas de membros';
  END IF;

  SELECT family_id INTO v_target_fid
  FROM public.users WHERE id = p_target_user_id;

  IF v_target_fid IS DISTINCT FROM v_caller_fid THEN
    RAISE EXCEPTION 'family_mismatch: o utilizador alvo não pertence à sua família';
  END IF;

  IF length(p_new_password) < 4 THEN
    RAISE EXCEPTION 'password_too_short: a senha deve ter pelo menos 4 caracteres';
  END IF;

  -- Atualiza diretamente o hash bcrypt em auth.users
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = p_target_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.change_member_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_member_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_member_password(uuid, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 5) Colunas defensivas em calendar_events (caso schema mais antigo não as tenha)
-- -----------------------------------------------------------------------------

ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS visible_to_child BOOLEAN DEFAULT true;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'family';
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6C5CE7';
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS end_date DATE;

-- Garante que a constraint de visibility existe (só adiciona se ainda não existir)
DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calendar_events_visibility_check'
      AND conrelid = 'public.calendar_events'::regclass
  ) THEN
    BEGIN
      ALTER TABLE public.calendar_events
        ADD CONSTRAINT calendar_events_visibility_check
        CHECK (visibility IN ('family', 'private', 'child'));
    EXCEPTION WHEN OTHERS THEN
      NULL; -- ignora se já existir com outro nome
    END;
  END IF;
END
$chk$;

-- -----------------------------------------------------------------------------
-- 7) Garantir RLS permissiva para earned_medals INSERT (api atribui medalhas)
-- -----------------------------------------------------------------------------

DO $em$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'earned_medals' AND policyname = 'Family can insert earned medals'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Family can insert earned medals" ON public.earned_medals
      FOR INSERT WITH CHECK (
        child_id IN (SELECT id FROM public.children WHERE family_id = public.get_current_user_family_id())
      );
    $p$;
  END IF;
END
$em$;

-- Medalhas padrão globais: ver supabase/migrations/20260515_medals_catalog_unique_global.sql
-- (30 conquistas com catalog_slug, índice único e deduplicação — evita INSERT sem ON CONFLICT repetir linhas).
-- Manter abaixo apenas se ainda precisar de placeholders mínimos antes de correr a migração:
INSERT INTO public.medals (name, name_en, description, icon, category, requirement_type, requirement_value, extra_points, rule_description, is_active)
VALUES
  ('Primeiros Passos',   'First Steps',    'Completa a tua primeira tarefa',       '🌱', 'tasks',  'task_count',  1,   5,  'Completa 1 tarefa',        true),
  ('Iniciante Dedicado', 'Dedicated Beginner', 'Completa 5 tarefas',              '⭐', 'tasks',  'task_count',  5,   10, 'Completa 5 tarefas',       true),
  ('Herói das Tarefas',  'Task Hero',      'Completa 20 tarefas',                 '🦸', 'tasks',  'task_count',  20,  25, 'Completa 20 tarefas',      true),
  ('Campeão',            'Champion',       'Completa 50 tarefas',                 '🏆', 'tasks',  'task_count',  50,  50, 'Completa 50 tarefas',      true),
  ('Sequência de 3',     'Streak 3',       '3 dias consecutivos com tarefas',     '🔥', 'streak', 'task_streak', 3,   10, 'Sequência de 3 dias',      true),
  ('Semana Perfeita',    'Perfect Week',   '7 dias consecutivos com tarefas',     '💎', 'streak', 'task_streak', 7,   20, 'Sequência de 7 dias',      true),
  ('Mês Exemplar',       'Exemplary Month','30 dias consecutivos com tarefas',    '👑', 'streak', 'task_streak', 30,  100,'Sequência de 30 dias',     true)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 9) RPC: create_savings_goal — criança ou pai cria meta de cofrinho
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_savings_goal(
  p_title        TEXT,
  p_target_amount NUMERIC,
  p_child_id     UUID DEFAULT NULL
)
RETURNS public.savings_goals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid  UUID;
  v_family_id   UUID;
  v_child_id    UUID := p_child_id;
  v_new_goal    public.savings_goals;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT family_id INTO v_family_id FROM public.users WHERE id = v_caller_uid;
  IF v_family_id IS NULL THEN RAISE EXCEPTION 'user_has_no_family'; END IF;

  -- Se child_id não for fornecido, tenta encontrar pelo user actual (criança logada)
  IF v_child_id IS NULL THEN
    SELECT id INTO v_child_id
    FROM public.children
    WHERE user_id = v_caller_uid AND family_id = v_family_id
    LIMIT 1;
  END IF;

  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'child_not_found: forneça p_child_id ou aceda com conta de criança';
  END IF;

  -- Validar que o child pertence à família do chamador
  IF NOT EXISTS (SELECT 1 FROM public.children WHERE id = v_child_id AND family_id = v_family_id) THEN
    RAISE EXCEPTION 'permission_denied: criança não pertence à sua família';
  END IF;

  INSERT INTO public.savings_goals (id, child_id, family_id, title, target_amount)
  VALUES (gen_random_uuid(), v_child_id, v_family_id, p_title, p_target_amount)
  RETURNING * INTO v_new_goal;

  RETURN v_new_goal;
END;
$$;

REVOKE ALL ON FUNCTION public.create_savings_goal(TEXT, NUMERIC, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_savings_goal(TEXT, NUMERIC, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 10) Permitir que crianças registem toma de medicamentos
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can manage family health_medication_logs" ON public.health_medication_logs;
CREATE POLICY "Users can manage family health_medication_logs" ON public.health_medication_logs
  FOR ALL USING (family_id = public.get_current_user_family_id());

-- -----------------------------------------------------------------------------
-- 11) Bucket uploads para imagens de saúde
-- -----------------------------------------------------------------------------
-- O bucket 'uploads' deve ser criado no Supabase Dashboard → Storage → New bucket
-- Nome: uploads | Public: true
-- Em alternativa, execute o seguinte (requer service_role):

INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
CREATE POLICY "Authenticated users can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'uploads');

DROP POLICY IF EXISTS "Public read uploads" ON storage.objects;
CREATE POLICY "Public read uploads"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'uploads');

DROP POLICY IF EXISTS "Authenticated users can update uploads" ON storage.objects;
CREATE POLICY "Authenticated users can update uploads"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'uploads');

DROP POLICY IF EXISTS "Authenticated users can delete uploads" ON storage.objects;
CREATE POLICY "Authenticated users can delete uploads"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'uploads');

-- -----------------------------------------------------------------------------
-- 13) Permitir que crianças criem pedidos de cofrinho (piggy_requests)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Parents manage piggy requests" ON public.piggy_requests;
DROP POLICY IF EXISTS "Family view piggy requests" ON public.piggy_requests;
DROP POLICY IF EXISTS "Children can insert piggy requests" ON public.piggy_requests;

CREATE POLICY "Family view piggy requests" ON public.piggy_requests
  FOR SELECT USING (family_id = public.get_current_user_family_id());

CREATE POLICY "Children can insert piggy requests" ON public.piggy_requests
  FOR INSERT WITH CHECK (family_id = public.get_current_user_family_id());

CREATE POLICY "Parents manage piggy requests" ON public.piggy_requests
  FOR ALL USING (
    family_id = public.get_current_user_family_id()
    AND public.get_current_user_role() IN ('parent', 'master')
  );

-- -----------------------------------------------------------------------------
-- 14) Confirmar Email desativado para auth — lembrete no comentário
--    No Supabase Dashboard: Authentication > Settings > desabilitar
--    "Enable email confirmations" para que signUp retorne sessão imediatamente.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 15) Bucket "avatars" para fotos de utilizadores
--     Execute como service_role ou no Supabase Dashboard → Storage → New bucket
--     Nome: avatars | Public: true
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
CREATE POLICY "Authenticated users can update avatars"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;
CREATE POLICY "Authenticated users can delete avatars"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars');

-- -----------------------------------------------------------------------------
-- 16) Crédito na meta do cofrinho ao aprovar pedido
--     A lógica está no frontend (api.js /allowance/piggy-requests/:id/review)
--     Alternativa mais robusta: criar uma RPC para garantir atomicidade
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.approve_piggy_request(UUID, UUID);
CREATE OR REPLACE FUNCTION public.approve_piggy_request(
  p_request_id   UUID,
  p_family_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req         piggy_requests%ROWTYPE;
  v_goal_id     UUID;
  v_goal_cur    NUMERIC;
  v_goal_tgt    NUMERIC;
  v_cycle_id    UUID;
  v_adj         NUMERIC;
BEGIN
  -- Buscar pedido (apenas pendente)
  SELECT * INTO v_req
    FROM piggy_requests
   WHERE id = p_request_id AND family_id = p_family_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido não encontrado ou já processado');
  END IF;

  -- Actualizar status
  UPDATE piggy_requests SET status = 'approved' WHERE id = p_request_id;

  -- Creditar a meta (procurar por child_id + título, case-insensitive)
  SELECT id, current_amount, target_amount
    INTO v_goal_id, v_goal_cur, v_goal_tgt
    FROM savings_goals
   WHERE child_id = v_req.child_id
     AND family_id = p_family_id
     AND lower(title) = lower(COALESCE(v_req.goal_title, ''))
   LIMIT 1;

  IF v_goal_id IS NOT NULL THEN
    UPDATE savings_goals
       SET current_amount = COALESCE(v_goal_cur, 0) + v_req.requested_amount,
           status = CASE
             WHEN v_goal_tgt IS NOT NULL
              AND COALESCE(v_goal_cur, 0) + v_req.requested_amount >= v_goal_tgt
             THEN 'completed'
             ELSE COALESCE((SELECT status FROM savings_goals WHERE id = v_goal_id), 'active')
           END
     WHERE id = v_goal_id;
  END IF;

  -- Debitar do ciclo de mesada aberto (ordenar por year/month — NÃO period_start)
  SELECT id, manual_adjustments INTO v_cycle_id, v_adj
    FROM allowance_cycles
   WHERE child_id = v_req.child_id
     AND family_id = p_family_id
     AND status = 'open'
   ORDER BY year DESC, month DESC
   LIMIT 1;

  IF v_cycle_id IS NOT NULL THEN
    UPDATE allowance_cycles
       SET manual_adjustments = COALESCE(v_adj, 0) - v_req.requested_amount
     WHERE id = v_cycle_id;
  END IF;

  -- Registar transacção (type 'debit' — não 'deduction')
  INSERT INTO allowance_transactions (id, family_id, child_id, cycle_id, type, amount, description, created_at)
  VALUES (gen_random_uuid(), p_family_id, v_req.child_id, v_cycle_id, 'debit',
          ABS(v_req.requested_amount),
          'Cofrinho: ' || COALESCE(v_req.goal_title, 'Meta'),
          now());

  RETURN jsonb_build_object('ok', true, 'cycle_id', v_cycle_id, 'goal_id', v_goal_id);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_piggy_request(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_piggy_request(UUID, UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 17) PERFIL no registo + TRIAL de 7 dias + Assinatura
-- ═══════════════════════════════════════════════════════════════════════════════

-- 17.1 Colunas em families para trial e assinatura
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS trial_started_at    TIMESTAMPTZ;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS trial_ends_at       TIMESTAMPTZ;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS subscription_id     TEXT;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS plan_id             TEXT;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS plan                TEXT DEFAULT 'free';
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS gestor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- gestor_user_id = responsável financeiro (fonte única de assinatura/trial por família)

-- 17.2 Coluna profile_type em users (pai/mae/filho/filha)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_type TEXT;

-- 17.3 Tabela de histórico de assinaturas (audit)
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,         -- trial_started, trial_ended, subscribed, payment, cancelled
  subscription_id TEXT,
  amount NUMERIC(10,2),
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Family view subscription events" ON public.subscription_events;
CREATE POLICY "Family view subscription events" ON public.subscription_events
  FOR SELECT USING (family_id = public.get_current_user_family_id());

-- 17.4 RPC atualizada: register_family_and_user com perfil e trial
DROP FUNCTION IF EXISTS public.register_family_and_user(text, text);
DROP FUNCTION IF EXISTS public.register_family_and_user(text, text, text);
CREATE OR REPLACE FUNCTION public.register_family_and_user(
  p_family_name  TEXT DEFAULT NULL,
  p_user_name    TEXT DEFAULT NULL,
  p_profile_type TEXT DEFAULT 'pai'   -- 'pai' | 'mae' | 'filho' | 'filha'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID;
  v_fid       UUID;
  v_email     TEXT;
  v_fn        TEXT;
  v_un        TEXT;
  v_profile   TEXT;
  v_role      TEXT;
  v_avatar    TEXT;
  meta        JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Já tem família? Apenas atualiza profile_type/avatar.
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.family_id IS NOT NULL) THEN
    IF p_profile_type IS NOT NULL THEN
      UPDATE public.users SET profile_type = lower(p_profile_type) WHERE id = v_uid;
    END IF;
    RETURN (
      SELECT jsonb_build_object('family_id', u.family_id, 'already_registered', true)
      FROM public.users u WHERE u.id = v_uid LIMIT 1
    );
  END IF;

  SELECT email::text, COALESCE(raw_user_meta_data, '{}'::jsonb)
    INTO v_email, meta
    FROM auth.users WHERE id = v_uid;

  v_profile := lower(COALESCE(NULLIF(trim(p_profile_type), ''), 'pai'));
  IF v_profile NOT IN ('pai', 'mae', 'mãe', 'filho', 'filha') THEN
    v_profile := 'pai';
  END IF;
  IF v_profile = 'mãe' THEN v_profile := 'mae'; END IF;

  -- Mapear perfil → role e avatar default
  v_role := CASE WHEN v_profile IN ('pai','mae') THEN 'parent' ELSE 'child' END;
  v_avatar := CASE v_profile
    WHEN 'pai'   THEN 'parent_male'
    WHEN 'mae'   THEN 'parent_female'
    WHEN 'filho' THEN 'gamer'
    WHEN 'filha' THEN 'princess'
    ELSE NULL
  END;

  v_fn := COALESCE(NULLIF(trim(p_family_name), ''), NULLIF(trim(meta->>'family_name'), ''), 'Minha família');
  v_un := COALESCE(NULLIF(trim(p_user_name), ''),  NULLIF(trim(meta->>'name'), ''), split_part(v_email, '@', 1), 'Utilizador');

  IF v_role = 'child' THEN
    RAISE EXCEPTION 'Contas Filho/Filha são criadas pelo gestor no painel de administração da família.';
  END IF;

  -- Criar família com trial + gestor único financeiro (= este utilizador pai/mãe)
  INSERT INTO public.families (
    name, plan, status, subscription_status,
    trial_started_at, trial_ends_at,
    gestor_user_id
  )
  VALUES (
    v_fn, 'free', 'trial', 'trial',
    now(), now() + INTERVAL '7 days',
    v_uid
  )
  RETURNING id INTO v_fid;

  -- Criar/atualizar utilizador (pai/mãe fundador são sempre gestor de facturação)
  INSERT INTO public.users (id, name, email, role, family_id, status, must_change_password, profile_type, avatar_preset, access_profile)
  VALUES (v_uid, v_un, v_email, v_role, v_fid, 'active', false, v_profile, v_avatar, 'gestor')
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, public.users.name),
    email = COALESCE(EXCLUDED.email, public.users.email),
    family_id = EXCLUDED.family_id,
    role = CASE WHEN public.users.role = 'master' THEN public.users.role ELSE EXCLUDED.role END,
    status = 'active',
    profile_type = EXCLUDED.profile_type,
    avatar_preset = COALESCE(public.users.avatar_preset, EXCLUDED.avatar_preset),
    access_profile = COALESCE(public.users.access_profile, EXCLUDED.access_profile),
    updated_at = now();

  -- Log do início do trial
  INSERT INTO public.subscription_events (family_id, event_type, payload)
  VALUES (v_fid, 'trial_started', jsonb_build_object('user_id', v_uid, 'profile', v_profile));

  RETURN jsonb_build_object(
    'family_id', v_fid,
    'profile_type', v_profile,
    'role', v_role,
    'trial_ends_at', (now() + INTERVAL '7 days')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_family_and_user(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_family_and_user(TEXT, TEXT, TEXT) TO authenticated;

-- 17.5 RPC para activar assinatura (chamada após pagamento confirmado)
CREATE OR REPLACE FUNCTION public.activate_subscription(
  p_subscription_id TEXT,
  p_plan_id         TEXT DEFAULT 'premium_mensal',
  p_plan            TEXT DEFAULT 'premium'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fid UUID;
  v_gest UUID;
BEGIN
  v_fid := public.get_current_user_family_id();
  IF v_fid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT f.gestor_user_id INTO v_gest FROM public.families f WHERE f.id = v_fid;
  IF v_gest IS NULL THEN
    SELECT u.id INTO v_gest
      FROM public.users u
      WHERE u.family_id = v_fid
        AND u.role = 'parent'
        AND COALESCE(u.access_profile, 'gestor') = 'gestor'
      ORDER BY u.created_at ASC NULLS LAST
      LIMIT 1;
    IF v_gest IS NOT NULL THEN
      UPDATE public.families SET gestor_user_id = v_gest WHERE id = v_fid;
    END IF;
  END IF;

  IF v_gest IS NULL OR auth.uid() IS DISTINCT FROM v_gest THEN
    RAISE EXCEPTION 'only_gestor_can_activate_subscription';
  END IF;

  UPDATE public.families
     SET subscription_status = 'active',
         subscription_id = p_subscription_id,
         plan_id = p_plan_id,
         plan = p_plan,
         status = 'active'
   WHERE id = v_fid;

  INSERT INTO public.subscription_events (family_id, event_type, subscription_id, payload)
  VALUES (v_fid, 'subscribed', p_subscription_id,
          jsonb_build_object('plan_id', p_plan_id, 'plan', p_plan));

  RETURN jsonb_build_object('ok', true, 'family_id', v_fid);
END;
$$;

REVOKE ALL ON FUNCTION public.activate_subscription(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_subscription(TEXT, TEXT, TEXT) TO authenticated;

-- 17.6 RPC helper: estado do trial / assinatura
CREATE OR REPLACE FUNCTION public.get_subscription_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fid UUID;
  v_row public.families%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  v_fid := public.get_current_user_family_id();
  IF v_fid IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT * INTO v_row FROM public.families WHERE id = v_fid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  -- Auto-marca como expired quando o trial passou
  IF v_row.subscription_status = 'trial' AND v_row.trial_ends_at IS NOT NULL AND v_row.trial_ends_at < v_now THEN
    UPDATE public.families SET subscription_status = 'expired' WHERE id = v_fid;
    v_row.subscription_status := 'expired';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'subscription_status', v_row.subscription_status,
    'trial_started_at', v_row.trial_started_at,
    'trial_ends_at', v_row.trial_ends_at,
    'plan', v_row.plan,
    'days_remaining', GREATEST(0, EXTRACT(DAY FROM (v_row.trial_ends_at - v_now)))::int
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_subscription_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_subscription_status() TO authenticated;

-- 17.6b Fonte única de acesso ao plano pagamento (trial/assinatura) — sempre ao nível família/gestor
CREATE OR REPLACE FUNCTION public.get_effective_subscription()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_me   public.users%ROWTYPE;
  v_fam  public.families%ROWTYPE;
  v_gest UUID;
  v_now  TIMESTAMPTZ := now();
  v_sub  TEXT;
  v_has  BOOLEAN := false;
  v_reason TEXT := 'unknown';
  v_can_manage BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'has_access', false, 'reason', 'not_authenticated',
      'can_manage_billing', false, 'gestor_id', NULL, 'family_id', NULL);
  END IF;

  SELECT * INTO v_me FROM public.users WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'has_access', false, 'reason', 'no_profile',
      'can_manage_billing', false, 'gestor_id', NULL, 'family_id', NULL);
  END IF;

  IF v_me.role = 'master' THEN
    RETURN jsonb_build_object(
      'ok', true, 'has_access', true, 'reason', 'master',
      'can_manage_billing', true,
      'is_billing_contact', true, 'family_id', v_me.family_id, 'gestor_id', NULL
    );
  END IF;

  IF v_me.family_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'has_access', false, 'reason', 'no_family',
      'can_manage_billing', false,
      'is_billing_contact', false, 'gestor_id', NULL, 'family_id', NULL,
      'subscription_status', NULL, 'trial_ends_at', NULL
    );
  END IF;

  SELECT * INTO v_fam FROM public.families WHERE id = v_me.family_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'has_access', false, 'reason', 'family_missing',
      'family_id', v_me.family_id, 'can_manage_billing', false);
  END IF;

  -- Resolver gestor financeiro da família
  v_gest := v_fam.gestor_user_id;
  IF v_gest IS NULL THEN
    SELECT u.id INTO v_gest FROM public.users u
      WHERE u.family_id = v_fam.id AND u.role = 'parent'
        AND COALESCE(u.access_profile, 'gestor') = 'gestor'
      ORDER BY u.created_at ASC NULLS LAST LIMIT 1;
    IF v_gest IS NOT NULL THEN
      UPDATE public.families SET gestor_user_id = v_gest WHERE id = v_fam.id;
      v_fam.gestor_user_id := v_gest;
    END IF;
  END IF;

  v_can_manage := (
    v_uid = v_gest
    AND COALESCE(lower(trim(v_me.access_profile)), 'gestor') = 'gestor'
  );

  IF v_gest IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'has_access', false, 'reason', 'no_gestor',
      'family_id', v_fam.id, 'gestor_id', NULL,
      'subscription_status', v_fam.subscription_status, 'trial_ends_at', v_fam.trial_ends_at,
      'can_manage_billing', false, 'is_billing_contact', false
    );
  END IF;

  v_sub := lower(COALESCE(v_fam.subscription_status, 'trial'));

  IF v_sub = 'trial' AND v_fam.trial_ends_at IS NOT NULL AND v_fam.trial_ends_at < v_now THEN
    UPDATE public.families SET subscription_status = 'expired' WHERE id = v_fam.id;
    SELECT * INTO v_fam FROM public.families WHERE id = v_me.family_id;
    v_sub := lower(COALESCE(v_fam.subscription_status, 'trial'));
  END IF;

  IF v_sub = 'active' THEN
    v_has := true;
    v_reason := 'subscription_active';
  ELSIF v_sub = 'trial' AND (v_fam.trial_ends_at IS NULL OR v_fam.trial_ends_at >= v_now) THEN
    v_has := true;
    v_reason := 'trial_active';
  ELSIF v_sub = 'trial' THEN
    v_has := false;
    v_reason := 'trial_expired';
  ELSIF v_sub = 'past_due' THEN
    v_has := false;
    v_reason := 'subscription_past_due';
  ELSIF v_sub IN ('cancelled', 'expired') THEN
    v_has := false;
    v_reason := 'subscription_blocked';
  ELSE
    v_has := false;
    v_reason := 'no_subscription';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'has_access', v_has,
    'reason', v_reason,
    'family_id', v_fam.id,
    'gestor_id', v_gest,
    'subscription_status', v_fam.subscription_status,
    'trial_ends_at', v_fam.trial_ends_at,
    'is_billing_contact', v_can_manage,
    'can_manage_billing', v_can_manage
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_effective_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_effective_subscription() TO authenticated;

-- 17.7 Backfill: famílias antigas sem trial recebem 7 dias a partir de hoje
UPDATE public.families
   SET subscription_status = COALESCE(subscription_status, 'trial'),
       trial_started_at    = COALESCE(trial_started_at, created_at, now()),
       trial_ends_at       = COALESCE(trial_ends_at, COALESCE(created_at, now()) + INTERVAL '7 days')
 WHERE subscription_status IS NULL
    OR (subscription_status = 'trial' AND trial_ends_at IS NULL);

UPDATE public.families f
SET gestor_user_id = sub.gid
FROM (
  SELECT u.family_id AS fid, u.id AS gid
    FROM (
      SELECT DISTINCT ON (u.family_id) u.family_id, u.id, u.created_at
        FROM public.users u
       WHERE u.role = 'parent' AND COALESCE(u.access_profile, 'gestor') = 'gestor'
       ORDER BY u.family_id, u.created_at ASC NULLS LAST
    ) AS u
) AS sub
WHERE f.id = sub.fid
  AND f.gestor_user_id IS NULL;

-- Gestor apenas lê auditoria financeira de assinatura (dependentes não)
DROP POLICY IF EXISTS "Family view subscription events" ON public.subscription_events;
CREATE POLICY "Gestor can view subscription events" ON public.subscription_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.families fm
       WHERE fm.id = subscription_events.family_id
         AND fm.gestor_user_id = auth.uid()
    )
  );
-- ═══════════════════════════════════════════════════════════════════════════════
-- 18) Tabelas de suporte ao Mercado Pago
-- ═══════════════════════════════════════════════════════════════════════════════

-- Planos do Mercado Pago (preenchidos pela Edge Function mp-create-plan)
CREATE TABLE IF NOT EXISTS public.mp_plans (
  code        TEXT PRIMARY KEY,             -- premium_mensal, premium_anual
  mp_plan_id  TEXT NOT NULL,                -- preapproval_plan.id
  label       TEXT,
  amount      NUMERIC(10,2) NOT NULL,
  currency    TEXT DEFAULT 'BRL',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.mp_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read plans" ON public.mp_plans;
CREATE POLICY "Authenticated can read plans" ON public.mp_plans
  FOR SELECT TO authenticated USING (active = true);

-- Eventos de webhook (idempotência)
CREATE TABLE IF NOT EXISTS public.mp_webhook_events (
  event_id    TEXT PRIMARY KEY,
  type        TEXT,
  payload     JSONB,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.mp_webhook_events ENABLE ROW LEVEL SECURITY;
-- Apenas service_role escreve/lê (default sem políticas → bloqueado para anon/authenticated)

-- ═══════════════════════════════════════════════════════════════════════════════
-- 19) Auditoria gateway (opcional ao subscription_events) + RLS forte em families
-- ═══════════════════════════════════════════════════════════════════════════════
-- Histórico de eventos vindos do MP (payload bruto apenas via service_role / Edge Fn).
CREATE TABLE IF NOT EXISTS public.payment_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       UUID REFERENCES public.families(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  gateway         TEXT NOT NULL DEFAULT 'mercadopago',
  event_type      TEXT NOT NULL,
  event_id        TEXT,
  payload         JSONB,
  processed       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_payment_events_family ON public.payment_events (family_id, created_at DESC);
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.payment_events IS 'Auditoria de webhooks/checkout; apenas service_role deve inspecionar payloads.';

-- Impede PATCH directo pelo cliente anonimizado em campos financeiros —
-- apenas o gestor financeiro da família (ou conta master pelo script baas_complete_fix).
DROP POLICY IF EXISTS "Users can update their own family" ON public.families;

DROP POLICY IF EXISTS "Gestor financeiro atualiza família" ON public.families;

CREATE POLICY "Gestor financeiro atualiza família"
  ON public.families FOR UPDATE TO authenticated
  USING (
    id = public.get_current_user_family_id()
    AND gestor_user_id IS NOT NULL
    AND gestor_user_id = auth.uid()
  )
  WITH CHECK (
    id = public.get_current_user_family_id()
    AND gestor_user_id IS NOT NULL
    AND gestor_user_id = auth.uid()
  );

