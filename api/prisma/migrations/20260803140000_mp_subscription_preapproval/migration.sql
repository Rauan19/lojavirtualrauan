-- AlterTable
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "mpPreapprovalId" TEXT;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "mpSubscriptionStatus" TEXT;

-- AlterTable
ALTER TABLE "PlatformInvoice" ADD COLUMN IF NOT EXISTS "mpPreapprovalId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformInvoice_mpPreapprovalId_idx" ON "PlatformInvoice"("mpPreapprovalId");
