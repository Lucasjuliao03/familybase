-- ─────────────────────────────────────────────────────────────────────────────
-- Adiciona a coluna has_onboarded à tabela public.users para controle do fluxo
-- de onboarding inicial do responsável no aplicativo mobile.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.users add column if not exists has_onboarded boolean default false;
