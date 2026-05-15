-- =============================================================================
-- Diagnóstico: erro "family_not_found" ao chamar stripe-create-checkout-session
--
-- Significa: public.users.family_id está preenchido MAS não existe linha em
--            public.families com esse id (dados inconsistentes).
-- Rode no SQL Editor do Supabase (como postgres / service_role).
-- =============================================================================

-- 1) Substitui o email pelo da conta que tenta pagar:
SELECT u.id AS user_id,
       u.email,
       u.family_id,
       f.id AS family_row_exists,
       f.name AS family_name
FROM public.users u
LEFT JOIN public.families f ON f.id = u.family_id
WHERE u.email = 'METE_O_TEU_EMAIL_AQUI';

-- Se family_id NÃO é NULL mas family_row_exists É NULL → precisas corrigir dados.

-- 2) Listar utilizadores órfãos (family_id aponta para nada)
SELECT u.id, u.email, u.family_id
FROM public.users u
LEFT JOIN public.families f ON f.id = u.family_id
WHERE u.family_id IS NOT NULL AND f.id IS NULL;

-- 3) Listar utilizadores órfãos (family_id aponta para nada)
SELECT u.id, u.email, u.family_id
FROM public.users u
LEFT JOIN public.families f ON f.id = u.family_id
WHERE u.family_id IS NOT NULL AND f.id IS NULL;

-- -----------------------------------------------------------------------------
-- 4) CORRECCIÃO SEGURA — cria a linha em `families` com o mesmo `id`
--    que já está em `users.family_id` (recuperação após erro de migração / dados
--    escritos só em `users`). Executa só se o passo 2 mostrou pelo menos uma linha.
--
-- Requisitos típicos: utilizador pai com access_profile gestor (ou conta master).
-- Se der erro por gestor_user_id FK, confirma que o user.id existe!
-- -----------------------------------------------------------------------------
INSERT INTO public.families (
  id,
  name,
  language,
  plan,
  status,
  subscription_status,
  trial_started_at,
  trial_ends_at,
  gestor_user_id
)
SELECT DISTINCT ON (u.family_id)
  u.family_id,
  COALESCE(
    NULLIF(trim(BOTH FROM u.name), ''),
    trim(BOTH FROM split_part(u.email, '@', 1))
  ) || E' · Família (recuperada)',
  'pt',
  'free',
  'trial',
  'trial',
  NOW(),
  NOW() + INTERVAL '7 days',
  u.id
FROM public.users u
LEFT JOIN public.families f ON f.id = u.family_id
WHERE u.family_id IS NOT NULL
  AND f.id IS NULL
  AND (
    (
      u.role = 'parent'
      AND COALESCE(u.access_profile, 'gestor') = 'gestor'
    )
    OR u.role = 'master'
  )
ORDER BY u.family_id, u.created_at ASC NULLS LAST
ON CONFLICT (id) DO NOTHING;

-- 5) Voltar ao passo 1 com o teu email — espera-se family_row_exists preenchido.
