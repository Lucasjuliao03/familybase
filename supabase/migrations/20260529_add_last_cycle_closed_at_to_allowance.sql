-- ─────────────────────────────────────────────────────────────────────────────
-- Adiciona a coluna last_cycle_closed_at à tabela public.allowance_settings para
-- controlar o filtro do extrato parcial de transações de mesada.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.allowance_settings add column if not exists last_cycle_closed_at timestamp with time zone;
