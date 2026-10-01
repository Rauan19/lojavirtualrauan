-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "expiredUnpaidAt" TIMESTAMP(3),
ADD COLUMN     "recoveryEmailSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "abandonedCartEmail" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Order_storeId_expiredUnpaidAt_idx" ON "Order"("storeId", "expiredUnpaidAt");
