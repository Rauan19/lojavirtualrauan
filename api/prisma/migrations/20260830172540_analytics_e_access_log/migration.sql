-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "analyticsGaId" TEXT,
ADD COLUMN     "analyticsPixelId" TEXT;

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "customerId" TEXT,
    "userId" TEXT,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessLog_createdAt_idx" ON "AccessLog"("createdAt");

-- CreateIndex
CREATE INDEX "AccessLog_storeId_createdAt_idx" ON "AccessLog"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessLog_customerId_createdAt_idx" ON "AccessLog"("customerId", "createdAt");
