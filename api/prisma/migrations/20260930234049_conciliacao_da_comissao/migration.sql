-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "platformFeeChargedCents" INTEGER,
ADD COLUMN     "platformFeeMismatch" BOOLEAN NOT NULL DEFAULT false;
