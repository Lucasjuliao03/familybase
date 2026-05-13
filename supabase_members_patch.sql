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

-- Medalhas padrão globais (se não existirem)
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
  v_req       piggy_requests%ROWTYPE;
  v_goal      savings_goals%ROWTYPE;
  v_cycle_id  UUID;
  v_adj       NUMERIC;
BEGIN
  -- Buscar pedido
  SELECT * INTO v_req
    FROM piggy_requests
   WHERE id = p_request_id AND family_id = p_family_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido não encontrado ou já processado');
  END IF;

  -- Actualizar status do pedido
  UPDATE piggy_requests
     SET status = 'approved', updated_at = now()
   WHERE id = p_request_id;

  -- Creditar na meta do cofrinho (procura por child_id + title)
  SELECT * INTO v_goal
    FROM savings_goals
   WHERE child_id = v_req.child_id
     AND family_id = p_family_id
     AND lower(title) = lower(v_req.goal_title)
   LIMIT 1;

  IF FOUND THEN
    UPDATE savings_goals
       SET current_amount = COALESCE(current_amount, 0) + v_req.requested_amount,
           status = CASE
             WHEN COALESCE(current_amount, 0) + v_req.requested_amount >= target_amount THEN 'completed'
             ELSE status
           END,
           updated_at = now()
     WHERE id = v_goal.id;
  END IF;

  -- Debitar do ciclo de mesada aberto
  SELECT id, manual_adjustments INTO v_cycle_id, v_adj
    FROM allowance_cycles
   WHERE child_id = v_req.child_id
     AND family_id = p_family_id
     AND status = 'open'
   ORDER BY period_start DESC
   LIMIT 1;

  IF v_cycle_id IS NOT NULL THEN
    UPDATE allowance_cycles
       SET manual_adjustments = COALESCE(v_adj, 0) - v_req.requested_amount,
           updated_at = now()
     WHERE id = v_cycle_id;
  END IF;

  -- Registar transacção
  INSERT INTO allowance_transactions (id, family_id, child_id, type, amount, description, created_at)
  VALUES (gen_random_uuid(), p_family_id, v_req.child_id, 'deduction',
          -v_req.requested_amount,
          'Cofrinho: ' || COALESCE(v_req.goal_title, 'Meta'),
          now())
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_piggy_request(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_piggy_request(UUID, UUID) TO authenticated;
