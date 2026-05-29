-- ============================================================================
-- Modo "Proxy de perfil do filho" (pai atuando como filho)
-- ----------------------------------------------------------------------------
-- Permite que pais/gestores/parentes atuem dentro do perfil de um filho sem
-- sair da própria conta, mantendo trilha de auditoria completa:
--   * user_id     = filho (dono do registro)
--   * performed_by = pai (quem realmente executou a ação)
--   * timestamp    = momento da ação
--
-- Idempotente: pode ser re-executada com segurança.
-- ============================================================================

-- ── 1. Colunas de auditoria em tabelas operacionais ────────────────────────
-- Registra QUEM efetivamente executou a ação (pai), mesmo quando o registro
-- pertence ao filho. NULL = ação feita pelo próprio dono (fluxo normal).

ALTER TABLE public.task_occurrences
  ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.task_occurrences
  ADD COLUMN IF NOT EXISTS acted_via_proxy BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.history
  ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.history
  ADD COLUMN IF NOT EXISTS acted_via_proxy BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. Tabela dedicada de auditoria do modo filho ──────────────────────────
CREATE TABLE IF NOT EXISTS public.child_proxy_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  -- Perfil do filho dentro do qual a ação foi executada
  child_id      UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  -- Conta de login do filho (quando existir), para correlação com auth.users
  child_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Pai/gestor que efetivamente executou a ação
  performed_by  UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  -- Tipo de ação legível (ex.: 'task_complete', 'proxy_enter', 'proxy_exit')
  action        TEXT NOT NULL,
  http_method   TEXT,
  path          TEXT,
  entity        TEXT,
  entity_id     TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_child_proxy_audit_family
  ON public.child_proxy_audit (family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_child_proxy_audit_child
  ON public.child_proxy_audit (child_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_child_proxy_audit_actor
  ON public.child_proxy_audit (performed_by, created_at DESC);

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.child_proxy_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proxy_audit_select_family" ON public.child_proxy_audit;
CREATE POLICY "proxy_audit_select_family" ON public.child_proxy_audit
  FOR SELECT
  USING (family_id = public.get_current_user_family_id());

-- Inserção só do próprio ator, na própria família. O log é imutável (sem update/delete).
DROP POLICY IF EXISTS "proxy_audit_insert_self" ON public.child_proxy_audit;
CREATE POLICY "proxy_audit_insert_self" ON public.child_proxy_audit
  FOR INSERT
  WITH CHECK (
    performed_by = auth.uid()
    AND family_id = public.get_current_user_family_id()
  );

GRANT SELECT, INSERT ON public.child_proxy_audit TO authenticated;

-- ── 4. RPC central de auditoria ────────────────────────────────────────────
-- Valida que o ator é pai/gestor/parente, que o filho pertence à família do
-- ator, força performed_by = auth.uid() e insere o log. Crianças NÃO podem
-- registrar via proxy (segurança: requisito 6).
CREATE OR REPLACE FUNCTION public.log_child_proxy_action(
  p_child_id    UUID,
  p_action      TEXT,
  p_method      TEXT  DEFAULT NULL,
  p_path        TEXT  DEFAULT NULL,
  p_entity      TEXT  DEFAULT NULL,
  p_entity_id   TEXT  DEFAULT NULL,
  p_metadata    JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_role       TEXT;
  v_family     UUID;
  v_child_fam  UUID;
  v_child_user UUID;
  v_audit_id   UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '28000';
  END IF;

  SELECT role, family_id INTO v_role, v_family
  FROM public.users WHERE id = v_uid;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Utilizador não encontrado.' USING ERRCODE = '28000';
  END IF;

  -- Apenas responsáveis podem atuar como proxy de um filho.
  IF v_role NOT IN ('parent', 'relative', 'master') THEN
    RAISE EXCEPTION 'Apenas pais/gestores podem registar ações no perfil de um filho.'
      USING ERRCODE = '42501';
  END IF;

  SELECT family_id, user_id INTO v_child_fam, v_child_user
  FROM public.children WHERE id = p_child_id;

  IF v_child_fam IS NULL THEN
    RAISE EXCEPTION 'Perfil de filho não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  -- Master pode atravessar famílias; demais só a própria.
  IF v_role <> 'master' AND v_child_fam IS DISTINCT FROM v_family THEN
    RAISE EXCEPTION 'Filho não pertence à sua família.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.child_proxy_audit (
    family_id, child_id, child_user_id, performed_by,
    action, http_method, path, entity, entity_id, metadata
  )
  VALUES (
    v_child_fam, p_child_id, v_child_user, v_uid,
    COALESCE(p_action, 'proxy_action'), p_method, p_path, p_entity, p_entity_id,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_child_proxy_action(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_child_proxy_action(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ── 5. Leitura consolidada de auditoria (opcional, para telas de histórico) ─
CREATE OR REPLACE FUNCTION public.get_child_proxy_audit(
  p_child_id UUID DEFAULT NULL,
  p_limit    INTEGER DEFAULT 100
)
RETURNS SETOF public.child_proxy_audit
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.child_proxy_audit
  WHERE family_id = public.get_current_user_family_id()
    AND (p_child_id IS NULL OR child_id = p_child_id)
  ORDER BY created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
$$;

REVOKE ALL ON FUNCTION public.get_child_proxy_audit(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_child_proxy_audit(UUID, INTEGER) TO authenticated;
