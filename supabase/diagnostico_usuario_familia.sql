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

-- 3) Correcções são específicas do teu caso: criar familia ou UPDATE users.family_id.
