-- AlterTable
ALTER TABLE "PlatformInvoice" ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "method" TEXT NOT NULL DEFAULT 'CARD',
ADD COLUMN     "pixCopiaECola" TEXT,
ADD COLUMN     "pixExpiresAt" TIMESTAMP(3),
ADD COLUMN     "pixQrCodeBase64" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "billingMethod" TEXT DEFAULT 'CARD';

-- CreateIndex
CREATE INDEX "PlatformInvoice_storeId_method_status_idx" ON "PlatformInvoice"("storeId", "method", "status");
