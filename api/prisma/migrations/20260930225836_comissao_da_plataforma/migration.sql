-- CreateEnum
CREATE TYPE "PlatformFeeEntryType" AS ENUM ('CHARGE', 'REFUND', 'CHARGEBACK', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "platformFeeBaseCents" INTEGER,
ADD COLUMN     "platformFeeBps" INTEGER,
ADD COLUMN     "platformFeeCents" INTEGER;

-- AlterTable
ALTER TABLE "PlatformPlan" ADD COLUMN     "customDomainIncluded" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "feeBps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "platformFeeEnabled" BOOLEAN;

-- CreateTable
CREATE TABLE "PlatformFeeEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "PlatformFeeEntryType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "mpPaymentId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformFeeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformPlanChange" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "changedById" TEXT,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformPlanChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFeeEntry_idempotencyKey_key" ON "PlatformFeeEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PlatformFeeEntry_storeId_createdAt_idx" ON "PlatformFeeEntry"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformFeeEntry_createdAt_idx" ON "PlatformFeeEntry"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformFeeEntry_orderId_idx" ON "PlatformFeeEntry"("orderId");

-- CreateIndex
CREATE INDEX "PlatformPlanChange_planId_createdAt_idx" ON "PlatformPlanChange"("planId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformFeeEntry" ADD CONSTRAINT "PlatformFeeEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFeeEntry" ADD CONSTRAINT "PlatformFeeEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Catálogo com comissão por venda (split do Mercado Pago)
--   Começo       R$ 0      2%   até 50 produtos, sem domínio, sem NF-e
--   Essencial    R$ 59,90  1%   até 300 produtos, domínio próprio
--   Profissional R$ 129,90 0,5% ilimitado, NF-e
--   Avançado     R$ 249,90 0,5% ilimitado, NF-e, suporte prioritário
-- Mexe só nos planos-semente (por id). Plano criado à mão pelo Super Admin
-- fica sem taxa (feeBps 0) até alguém definir.
-- ============================================================
INSERT INTO "PlatformPlan" ("id", "name", "description", "amount", "periodDays", "badge", "highlight", "maxProducts", "nfeIncluded", "feeBps", "customDomainIncluded", "features", "active", "order", "updatedAt")
VALUES ('plan-seed-comeco', 'Começo', 'Para começar a vender sem mensalidade.', 0, 30, 'Grátis', false, 50, false, 200, false,
  '["Loja completa, sem mensalidade","Até 50 produtos","Pix, cartão e boleto pelo Mercado Pago","Frete pelo Melhor Envio","Taxa de 2% por venda","Endereço vendira.com.br/loja/sua-loja"]'::jsonb,
  true, -1, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

UPDATE "PlatformPlan" SET
  "amount" = 59.90, "maxProducts" = 300, "feeBps" = 100, "customDomainIncluded" = true,
  "features" = '["Tudo do Começo","Até 300 produtos","Domínio próprio (www.sualoja.com.br)","Taxa de 1% por venda","Cupons, promoções e avaliações"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'plan-seed-essencial';

UPDATE "PlatformPlan" SET "feeBps" = 50, "customDomainIncluded" = true,
  "features" = '["Tudo do Essencial","Produtos ilimitados","Nota fiscal automática (NF-e e NFC-e)","Taxa de 0,5% por venda"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'plan-seed-mensal';

UPDATE "PlatformPlan" SET "feeBps" = 50, "customDomainIncluded" = true,
  "features" = '["Tudo do Profissional","Taxa de 0,5% por venda","Suporte prioritário pelo WhatsApp","Ajuda para configurar domínio, frete e nota fiscal"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'plan-seed-pro';

UPDATE "PlatformPlan" SET
  "amount" = 599.00, "maxProducts" = 300, "feeBps" = 100, "customDomainIncluded" = true,
  "description" = 'Pagamento anual. Equivale a R$ 49,92 por mês.',
  "features" = '["Tudo do Começo","Até 300 produtos","Domínio próprio (www.sualoja.com.br)","Taxa de 1% por venda","Cupons, promoções e avaliações"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'plan-seed-essencial-anual';

UPDATE "PlatformPlan" SET "feeBps" = 50, "customDomainIncluded" = true,
  "features" = '["Tudo do Essencial","Produtos ilimitados","Nota fiscal automática (NF-e e NFC-e)","Taxa de 0,5% por venda"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'plan-seed-mensal-anual';

UPDATE "PlatformPlan" SET "feeBps" = 50, "customDomainIncluded" = true,
  "features" = '["Tudo do Profissional","Taxa de 0,5% por venda","Suporte prioritário pelo WhatsApp","Ajuda para configurar domínio, frete e nota fiscal"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'plan-seed-pro-anual';
