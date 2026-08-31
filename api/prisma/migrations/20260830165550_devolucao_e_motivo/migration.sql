-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "refundReasonType" TEXT,
ADD COLUMN     "returnReceivedAt" TIMESTAMP(3);
