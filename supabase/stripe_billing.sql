-- Stripe (Checkout + Billing). Executar no SQL Editor do Supabase após deploy das funções.
-- Idempotência de webhooks (eventos já vistos são ignorados).
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id    TEXT PRIMARY KEY,
  type        TEXT,
  payload     JSONB,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.families ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

COMMENT ON COLUMN public.families.stripe_customer_id IS 'Stripe Customer id (cus_...) para reutilizar no Checkout.';
COMMENT ON COLUMN public.families.subscription_id IS 'Subscription id na gateway ativa (ex. sub_* Stripe ou pré-approval MP legacy).';

