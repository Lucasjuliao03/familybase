-- Idêntico a 20260522_reset_family_data_robust.sql (mantém histórico de migrações enquanto
-- garante resets robustos mesmo em BDs com audit_logs sem DEFAULT ou tabelas extra).

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

  DELETE FROM public.allowance_transactions WHERE family_id = v_target;

  IF to_regclass('public.reward_redemptions') IS NOT NULL THEN
    DELETE FROM public.reward_redemptions WHERE family_id = v_target;
  END IF;

  DELETE FROM public.redemptions r
  USING public.children ch
  WHERE r.child_id = ch.id AND ch.family_id = v_target;

  IF to_regclass('public.piggy_requests') IS NOT NULL THEN
    DELETE FROM public.piggy_requests WHERE family_id = v_target;
  END IF;

  DELETE FROM public.savings_goals WHERE family_id = v_target;

  IF to_regclass('public.goals') IS NOT NULL THEN
    DELETE FROM public.goals WHERE family_id = v_target;
  END IF;

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

  DELETE FROM public.earned_medals em
  USING public.children ch
  WHERE em.child_id = ch.id AND ch.family_id = v_target;

  IF to_regclass('public.task_occurrences') IS NOT NULL THEN
    DELETE FROM public.task_occurrences WHERE family_id = v_target;
  END IF;

  IF to_regclass('public.task_allowance_rules') IS NOT NULL THEN
    DELETE FROM public.task_allowance_rules tar
    USING public.tasks tk
    WHERE tar.task_id = tk.id AND tk.family_id = v_target;
  END IF;

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

  BEGIN
    INSERT INTO public.audit_logs (id, user_id, role, module, action, description)
    VALUES (
      gen_random_uuid(),
      v_uid,
      'parent',
      'family_admin',
      'reset_family_operational_data',
      format('reset_family_data família=%s gestor=%s', v_target, v_uid)
    );
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM (SELECT NULL);
  END;

  INSERT INTO public.family_data_reset_audit (id, family_id, performed_by, success)
  VALUES (gen_random_uuid(), v_target, v_uid, true)
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
      IF v_uid IS NOT NULL AND COALESCE(v_target, v_fid) IS NOT NULL THEN
        INSERT INTO public.family_data_reset_audit (
          id, family_id, performed_by, success, error_message
        )
        VALUES (
          gen_random_uuid(),
          COALESCE(v_target, v_fid),
          v_uid,
          false,
          SQLERRM
        );
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM (SELECT NULL);
    END;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_family_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_family_data(uuid) TO authenticated;
