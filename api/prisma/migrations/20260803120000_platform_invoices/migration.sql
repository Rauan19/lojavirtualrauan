-- CreateTable
CREATE TABLE "PlatformInvoice" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "mpPreferenceId" TEXT,
    "mpPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformInvoice_mpPaymentId_key" ON "PlatformInvoice"("mpPaymentId");

-- CreateIndex
CREATE INDEX "PlatformInvoice_storeId_idx" ON "PlatformInvoice"("storeId");

-- CreateIndex
CREATE INDEX "PlatformInvoice_storeId_status_idx" ON "PlatformInvoice"("storeId", "status");

-- CreateIndex
CREATE INDEX "PlatformInvoice_mpPreferenceId_idx" ON "PlatformInvoice"("mpPreferenceId");

-- AddForeignKey
ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
