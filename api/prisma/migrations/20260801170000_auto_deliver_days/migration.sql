-- Auto-entregue após X dias do envio
ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "autoDeliverDays" INTEGER NOT NULL DEFAULT 15;
