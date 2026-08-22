-- Register a family and its primary user for the mobile signup flow.

CREATE OR REPLACE FUNCTION public.register_family_and_user_2(
  p_user_id uuid,
  p_user_name text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_family_name text DEFAULT NULL,
  p_profile_type text DEFAULT 'pai'::text,
  p_phone text DEFAULT NULL::text,
  p_date_of_birth text DEFAULT NULL::text,
  p_avatar_url text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := p_user_id;
  v_family_id uuid;
  v_trial_end timestamptz := now() + interval '7 days';
  v_fam_name text;
  v_usr_name text;
  v_contact_email text;
BEGIN
  IF v_user_id IS NULL THEN
  RAISE EXCEPTION 'user_id_is_required';
  END IF;

  PERFORM 1
  FROM public.users
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_profile_not_found: %', v_user_id;
  END IF;

  v_usr_name := COALESCE(
    NULLIF(trim(p_user_name), ''),
    (SELECT name FROM public.users WHERE id = v_user_id),
    'Usuário'
  );
  v_fam_name := COALESCE(
    NULLIF(trim(p_family_name), ''),
    'Família de ' || v_usr_name
  );
  v_contact_email := COALESCE(
    NULLIF(trim(p_contact_email), ''),
    (SELECT email FROM public.users WHERE id = v_user_id)
  );

  INSERT INTO public.families (
    name,
    subscription_status,
    trial_ends_at,
    gestor_user_id,
    contact_email
  )
  VALUES (
    v_fam_name,
    'trial',
    v_trial_end,
    v_user_id,
    v_contact_email
  )
  RETURNING id INTO v_family_id;

  UPDATE public.users
  SET
    name = v_usr_name,
    family_id = v_family_id,
    role = 'parent',
    access_profile = 'gestor',
    phone = COALESCE(p_phone, phone),
    address = COALESCE(p_address, address),
    date_of_birth = COALESCE(NULLIF(p_date_of_birth, '')::date, date_of_birth),
    avatar_url = COALESCE(NULLIF(p_avatar_url, ''), avatar_url),
    profile_type = COALESCE(NULLIF(p_profile_type, ''), profile_type)
  WHERE id = v_user_id;

  IF NOT FOUND THEN
  RAISE EXCEPTION 'user_profile_update_failed: %', v_user_id;
  END IF;

  INSERT INTO public.family_modules (family_id, module_key, is_enabled)
  SELECT
    v_family_id,
    module_key,
    true
  FROM unnest(ARRAY[
    'tasks', 'routines', 'calendar', 'allowance', 'family_shop', 'medals',
    'grades', 'piggy_bank', 'goals', 'reports', 'notifications', 'shopping',
    'health', 'mural', 'location'
  ]) AS modules(module_key)
  ON CONFLICT (family_id, module_key) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'family_id', v_family_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_family_and_user_2(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.register_family_and_user_2(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) TO authenticated;
