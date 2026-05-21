-- =============================================================================
-- reset_family_data: limpeza de dados OPERACIONAIS da família (gestor apenas).
-- Preserva: families, users, auth.users (indireto), children (linhas + identidade),
--           family_members, relative_children, family_modules, vínculos.
-- Elimina histórico de tarefas, notas, mesada/loja, calendário, saúde, mural, compras,
-- notificações internas, localização operacional e medalhas/cofres da família.
-- Atualiza pontos/Xp/streak das crianças para valores iniciais.
-- Audit: insere audit_logs + tabela opcional family_data_reset_audit.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.family_data_reset_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  performed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT
);

ALTER TABLE public.family_data_reset_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_data_reset_audit_gestor_select ON public.family_data_reset_audit;
CREATE POLICY family_data_reset_audit_gestor_select
  ON public.family_data_reset_audit FOR SELECT TO authenticated
  USING (
    family_id = public.get_current_user_family_id()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(trim(lower(u.role::text)), '') = 'parent'
        AND COALESCE(trim(lower(u.access_profile::text)), 'gestor') = 'gestor'
    )
  );

REVOKE ALL ON public.family_data_reset_audit FROM PUBLIC;
GRANT SELECT ON public.family_data_reset_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_family_data(p_family_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_ap text;
  v_fid uuid;
  v_target uuid;
  v_audit_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT trim(lower(role::text)), trim(lower(access_profile::text))
  INTO v_role, v_ap
  FROM public.users
  WHERE id = v_uid;

  IF v_role IS DISTINCT FROM 'parent'
     OR COALESCE(NULLIF(v_ap, ''), 'gestor') IS DISTINCT FROM 'gestor' THEN
    RAISE EXCEPTION 'only_gestor_can_reset_family_data';
  END IF;

  SELECT family_id INTO v_fid FROM public.users WHERE id = v_uid LIMIT 1;
  IF v_fid IS NULL THEN
    RAISE EXCEPTION 'no_family_for_user';
  END IF;

  v_target := COALESCE(p_family_id, v_fid);
  IF v_target <> v_fid THEN
    RAISE EXCEPTION 'family_access_denied';
  END IF;

  -- =======================================================================
  -- Apagar dados operacionais (ordem respeita FKs comuns do projeto Base Familia)
  -- =======================================================================

  DELETE FROM public.allowance_transactions WHERE family_id = v_target;

  DELETE FROM public.redemptions r
  USING public.children ch
  WHERE r.child_id = ch.id AND ch.family_id = v_target;

  IF to_regclass('public.piggy_requests') IS NOT NULL THEN
    DELETE FROM public.piggy_requests WHERE family_id = v_target;
  END IF;

  DELETE FROM public.savings_goals WHERE family_id = v_target;

  DELETE FROM public.allowance_cycles WHERE family_id = v_target;

  DELETE FROM public.allowance_settings WHERE family_id = v_target;

  DELETE FROM public.rewards WHERE family_id = v_target;

  DELETE FROM public.notifications WHERE family_id = v_target;

  DELETE FROM public.history WHERE family_id = v_target;

  DELETE FROM public.grades WHERE family_id = v_target;

  IF to_regclass('public.school_grade_periods') IS NOT NULL THEN
    DELETE FROM public.school_grade_periods WHERE family_id = v_target;
  END IF;
  IF to_regclass('public.school_grade_settings') IS NOT NULL THEN
    DELETE FROM public.school_grade_settings WHERE family_id = v_target;
  END IF;

  DELETE FROM public.calendar_events WHERE family_id = v_target;

  DELETE FROM public.shopping_list WHERE family_id = v_target;

  DELETE FROM public.notice_reads nr
  USING public.family_notices fn
  WHERE nr.notice_id = fn.id AND fn.family_id = v_target;

  DELETE FROM public.family_notices WHERE family_id = v_target;

  IF to_regclass('public.health_medication_logs') IS NOT NULL THEN
    DELETE FROM public.health_medication_logs hml
    USING public.medications med
    WHERE hml.medication_id = med.id AND med.family_id = v_target;
  END IF;

  IF to_regclass('public.health_appointments') IS NOT NULL THEN
    DELETE FROM public.health_appointments WHERE family_id = v_target;
  END IF;

  DELETE FROM public.health_records WHERE family_id = v_target;

  DELETE FROM public.medications WHERE family_id = v_target;

  DELETE FROM public.tasks WHERE family_id = v_target;

  DELETE FROM public.medals WHERE family_id IS NOT NULL AND family_id = v_target;

  DELETE FROM public.push_subscriptions WHERE family_id = v_target;

  IF to_regclass('public.location_events') IS NOT NULL THEN
    DELETE FROM public.location_events WHERE family_id = v_target;
  END IF;
  IF to_regclass('public.family_locations') IS NOT NULL THEN
    DELETE FROM public.family_locations WHERE family_id = v_target;
  END IF;
  IF to_regclass('public.family_member_devices') IS NOT NULL THEN
    DELETE FROM public.family_member_devices WHERE family_id = v_target;
  END IF;
  IF to_regclass('public.safe_zones') IS NOT NULL THEN
    DELETE FROM public.safe_zones WHERE family_id = v_target;
  END IF;

  IF to_regclass('public.subscription_events') IS NOT NULL THEN
    DELETE FROM public.subscription_events WHERE family_id = v_target;
  END IF;
  IF to_regclass('public.payment_events') IS NOT NULL THEN
    DELETE FROM public.payment_events WHERE family_id = v_target;
  END IF;

  -- Reset gamificação / mesada pontual nas crianças (mantém linha do perfil)
  UPDATE public.children SET
    points = 0,
    coins = 0,
    level = 1,
    xp = 0,
    xp_next_level = 100,
    streak_current = 0,
    streak_best = 0,
    streak_last_date = NULL,
    updated_at = now()
  WHERE family_id = v_target;

  INSERT INTO public.audit_logs (user_id, role, module, action, description)
  VALUES (
    v_uid,
    'parent',
    'family_admin',
    'reset_family_operational_data',
    format('reset_family_data família=%s gestor=%s', v_target, v_uid)
  );

  INSERT INTO public.family_data_reset_audit (family_id, performed_by, success)
  VALUES (v_target, v_uid, true)
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'ok', true,
    'family_id', v_target,
    'audit_row_id', v_audit_id,
    'performed_at', now()
  );
EXCEPTION
  WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.family_data_reset_audit (family_id, performed_by, success, error_message)
      VALUES (COALESCE(v_target, v_fid), v_uid, false, SQLERRM);
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_family_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_family_data(uuid) TO authenticated;

COMMENT ON FUNCTION public.reset_family_data(uuid) IS
  'Apaga dados operacionais da própria família do utilizador chamador (apenas pai com access_profile gestor). Transaccional.';

