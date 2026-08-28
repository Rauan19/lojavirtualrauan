-- Desliga auto-entregue por dias; adiciona vínculo de rastreio real
ALTER TABLE "Store"
  ALTER COLUMN "autoDeliverDays" SET DEFAULT 0;

UPDATE "Store" SET "autoDeliverDays" = 0 WHERE "autoDeliverDays" > 0;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "carrierShipmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_carrierShipmentId_idx" ON "Order"("carrierShipmentId");
CREATE INDEX IF NOT EXISTS "Order_trackingCode_idx" ON "Order"("trackingCode");
