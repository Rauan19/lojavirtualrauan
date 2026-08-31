-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "maxPerCustomer" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponReserved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);
