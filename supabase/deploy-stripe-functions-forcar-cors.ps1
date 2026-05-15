# Deploy Stripe Edge Functions COM --no-verify-jwt (OPTIONS sem token = sem bloqueio CORS).
#
# Corre a partir da raiz do repo:
#   cd C:\familia
#   powershell -ExecutionPolicy Bypass -File .\supabase\deploy-stripe-functions-forcar-cors.ps1
#
# Antes (uma vez):
#   npx supabase@latest login
#   npx supabase@latest link --project-ref vderyfcxzcxsazqkfzzf

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$lista = @(
  "stripe-create-checkout-session",
  "stripe-sync-checkout-session",
  "stripe-create-portal-session",
  "stripe-get-billing-summary",
  "stripe-cancel-subscription",
  "stripe-webhook"
)

foreach ($fn in $lista) {
  Write-Host ">>> deploy $fn"
  & npx supabase@latest functions deploy $fn --no-verify-jwt
}

Write-Host "Deploy Stripe concluido."
