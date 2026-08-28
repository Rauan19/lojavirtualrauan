-- Cache dos preapproval_plan_id do Mercado Pago (assinatura com plano associado)
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "mpPreapprovalPlans" JSONB;
