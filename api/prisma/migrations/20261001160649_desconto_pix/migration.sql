-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "pixDiscount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pixDiscountApplied" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "pixDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
