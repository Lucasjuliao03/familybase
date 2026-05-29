-- ─────────────────────────────────────────────────────────────────────────────
-- Cadastro de família (mobile "Tudo de Casa"): campos adicionais do responsável
-- e extensão do RPC public.register_family_and_user.
--
-- - Adiciona users.date_of_birth e users.address.
-- - Estende o RPC para gravar telefone, endereço, data de nascimento e avatar do
--   responsável, além de contact_email/contact_phone na família.
-- - Mantém compatibilidade com a app web (chama por argumentos nomeados
--   p_family_name/p_user_name/p_profile_type) via DEFAULTs.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.users add column if not exists date_of_birth date;
alter table public.users add column if not exists address text;

drop function if exists public.register_family_and_user(text, text, text);

create or replace function public.register_family_and_user(
  p_family_name   text default null,
  p_user_name     text default null,
  p_profile_type  text default 'pai',
  p_phone         text default null,
  p_address       text default null,
  p_date_of_birth date default null,
  p_avatar_url    text default null,
  p_contact_email text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Já tem família? Apenas atualiza dados de perfil fornecidos.
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.family_id IS NOT NULL) THEN
    UPDATE public.users SET
      profile_type  = COALESCE(NULLIF(lower(trim(p_profile_type)), ''), profile_type),
      phone         = COALESCE(NULLIF(trim(p_phone), ''), phone),
      address       = COALESCE(NULLIF(trim(p_address), ''), address),
      date_of_birth = COALESCE(p_date_of_birth, date_of_birth),
      avatar_url    = COALESCE(NULLIF(trim(p_avatar_url), ''), avatar_url),
      updated_at    = now()
    WHERE id = v_uid;
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
    gestor_user_id, contact_email, contact_phone
  )
  VALUES (
    v_fn, 'free', 'trial', 'trial',
    now(), now() + INTERVAL '7 days',
    v_uid,
    COALESCE(NULLIF(trim(p_contact_email), ''), v_email),
    NULLIF(trim(p_phone), '')
  )
  RETURNING id INTO v_fid;

  INSERT INTO public.users (
    id, name, email, role, family_id, status, must_change_password,
    profile_type, avatar_preset, access_profile,
    phone, address, date_of_birth, avatar_url
  )
  VALUES (
    v_uid, v_un, v_email, v_role, v_fid, 'active', false,
    v_profile, v_avatar, 'gestor',
    NULLIF(trim(p_phone), ''), NULLIF(trim(p_address), ''), p_date_of_birth, NULLIF(trim(p_avatar_url), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, public.users.name),
    email = COALESCE(EXCLUDED.email, public.users.email),
    family_id = EXCLUDED.family_id,
    role = CASE WHEN public.users.role = 'master' THEN public.users.role ELSE EXCLUDED.role END,
    status = 'active',
    profile_type = EXCLUDED.profile_type,
    avatar_preset = COALESCE(public.users.avatar_preset, EXCLUDED.avatar_preset),
    access_profile = COALESCE(public.users.access_profile, EXCLUDED.access_profile),
    phone = COALESCE(EXCLUDED.phone, public.users.phone),
    address = COALESCE(EXCLUDED.address, public.users.address),
    date_of_birth = COALESCE(EXCLUDED.date_of_birth, public.users.date_of_birth),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
    updated_at = now();

  INSERT INTO public.subscription_events (family_id, event_type, payload)
  VALUES (v_fid, 'trial_started', jsonb_build_object('user_id', v_uid, 'profile', v_profile));

  RETURN jsonb_build_object(
    'family_id', v_fid,
    'profile_type', v_profile,
    'role', v_role,
    'trial_ends_at', (now() + INTERVAL '7 days')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.register_family_and_user(text, text, text, text, text, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_family_and_user(text, text, text, text, text, date, text, text) TO authenticated;
