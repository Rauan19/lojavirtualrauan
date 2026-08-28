-- Multi-nicho, identidade PF/PJ, variantes e NFe

CREATE TYPE "StoreType" AS ENUM ('FASHION', 'SHOES', 'ELECTRONICS', 'GENERAL', 'CUSTOM');
CREATE TYPE "SellerDocType" AS ENUM ('CPF', 'CNPJ');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PENDING', 'AUTHORIZED', 'CANCELLED', 'REJECTED', 'ERROR');
CREATE TYPE "InvoiceModel" AS ENUM ('NFCE', 'NFE');

ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "storeType" "StoreType" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS "sellerDocType" "SellerDocType",
  ADD COLUMN IF NOT EXISTS "sellerDocument" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerLegalName" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerTradeName" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerIe" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerIm" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerZipCode" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerStreet" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerComplement" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerNeighborhood" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerCity" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerState" TEXT,
  ADD COLUMN IF NOT EXISTS "termsHtml" TEXT,
  ADD COLUMN IF NOT EXISTS "privacyHtml" TEXT,
  ADD COLUMN IF NOT EXISTS "returnsHtml" TEXT,
  ADD COLUMN IF NOT EXISTS "nfeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "nfeProvider" TEXT DEFAULT 'focusnfe',
  ADD COLUMN IF NOT EXISTS "nfeApiToken" TEXT,
  ADD COLUMN IF NOT EXISTS "nfeEnvironment" TEXT NOT NULL DEFAULT 'homologacao',
  ADD COLUMN IF NOT EXISTS "nfeSeries" TEXT NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS "nfeNextNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "nfeCscId" TEXT,
  ADD COLUMN IF NOT EXISTS "nfeCscToken" TEXT;

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "hasVariants" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ncm" TEXT,
  ADD COLUMN IF NOT EXISTS "cfop" TEXT,
  ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL DEFAULT 'UN';

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "customerDocument" TEXT;

ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "variantId" TEXT,
  ADD COLUMN IF NOT EXISTS "variantLabel" TEXT;

CREATE TABLE IF NOT EXISTS "ProductVariant" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sku" TEXT,
  "barcode" TEXT,
  "label" TEXT NOT NULL,
  "options" JSONB NOT NULL,
  "price" DECIMAL(10,2),
  "compareAt" DECIMAL(10,2),
  "stock" INTEGER NOT NULL DEFAULT 0,
  "weightKg" DECIMAL(10,3),
  "widthCm" DECIMAL(10,2),
  "heightCm" DECIMAL(10,2),
  "lengthCm" DECIMAL(10,2),
  "imageUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");
CREATE INDEX IF NOT EXISTS "ProductVariant_productId_active_idx" ON "ProductVariant"("productId", "active");

DO $$ BEGIN
  ALTER TABLE "ProductVariant"
    ADD CONSTRAINT "ProductVariant_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OrderItem"
    ADD CONSTRAINT "OrderItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Invoice" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "model" "InvoiceModel" NOT NULL DEFAULT 'NFCE',
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "number" INTEGER,
  "series" TEXT,
  "accessKey" TEXT,
  "protocol" TEXT,
  "xmlUrl" TEXT,
  "pdfUrl" TEXT,
  "providerRef" TEXT,
  "errorMessage" TEXT,
  "issuedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_orderId_key" ON "Invoice"("orderId");
CREATE INDEX IF NOT EXISTS "Invoice_storeId_idx" ON "Invoice"("storeId");
CREATE INDEX IF NOT EXISTS "Invoice_storeId_status_idx" ON "Invoice"("storeId", "status");

DO $$ BEGIN
  ALTER TABLE "Invoice"
    ADD CONSTRAINT "Invoice_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Invoice"
    ADD CONSTRAINT "Invoice_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
