-- Sincroniza o histórico de migrations com o schema.prisma.
--
-- Estas tabelas/colunas só existiam em bancos criados com `prisma db push`.
-- Um `prisma migrate deploy` em banco novo (produção) subia SEM Coupon,
-- Promotion, campos de frete, impressora e reembolso — app quebrada.
--
-- Escrita de forma idempotente para poder rodar também em bases que já têm tudo.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED', 'FREE_SHIPPING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DropIndex
DROP INDEX IF EXISTS "Address_customerId_key";

-- AlterTable
ALTER TABLE "Address" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS     "couponCode" TEXT,
ADD COLUMN IF NOT EXISTS     "couponId" TEXT,
ADD COLUMN IF NOT EXISTS     "mpRefundId" TEXT,
ADD COLUMN IF NOT EXISTS     "refundReason" TEXT,
ADD COLUMN IF NOT EXISTS     "refundRequestedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "refundStatus" TEXT,
ADD COLUMN IF NOT EXISTS     "refundedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "trackingUrl" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS     "heightCm" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS     "installments" INTEGER,
ADD COLUMN IF NOT EXISTS     "lengthCm" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS     "weightKg" DECIMAL(10,3),
ADD COLUMN IF NOT EXISTS     "widthCm" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "ProductVariant" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS     "checkoutMode" TEXT NOT NULL DEFAULT 'personalized',
ADD COLUMN IF NOT EXISTS     "freteBairroOrigem" TEXT,
ADD COLUMN IF NOT EXISTS     "freteCepOrigem" TEXT,
ADD COLUMN IF NOT EXISTS     "freteCidadeOrigem" TEXT,
ADD COLUMN IF NOT EXISTS     "freteComplementoOrigem" TEXT,
ADD COLUMN IF NOT EXISTS     "freteEmailContato" TEXT,
ADD COLUMN IF NOT EXISTS     "freteNumeroOrigem" TEXT,
ADD COLUMN IF NOT EXISTS     "freteRuaOrigem" TEXT,
ADD COLUMN IF NOT EXISTS     "freteSandbox" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "freteToken" TEXT,
ADD COLUMN IF NOT EXISTS     "freteUfOrigem" TEXT,
ADD COLUMN IF NOT EXISTS     "marqueeEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS     "marqueeImages" JSONB,
ADD COLUMN IF NOT EXISTS     "monthlyFee" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS     "planDueAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "printerAutoPrint" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "printerHost" TEXT,
ADD COLUMN IF NOT EXISTS     "printerName" TEXT,
ADD COLUMN IF NOT EXISTS     "printerPaperWidth" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN IF NOT EXISTS     "printerPort" INTEGER NOT NULL DEFAULT 9100,
ADD COLUMN IF NOT EXISTS     "printerType" TEXT NOT NULL DEFAULT 'BROWSER';

-- CreateTable
CREATE TABLE IF NOT EXISTS "Coupon" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "type" "DiscountType" NOT NULL DEFAULT 'PERCENT',
    "value" DECIMAL(10,2) NOT NULL,
    "minSubtotal" DECIMAL(10,2),
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Promotion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Coupon_storeId_idx" ON "Coupon"("storeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Coupon_storeId_active_idx" ON "Coupon"("storeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_storeId_code_key" ON "Coupon"("storeId", "code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Promotion_storeId_idx" ON "Promotion"("storeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Promotion_storeId_active_idx" ON "Promotion"("storeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Promotion_storeId_productId_key" ON "Promotion"("storeId", "productId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_storeId_refundStatus_idx" ON "Order"("storeId", "refundStatus");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

