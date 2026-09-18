-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "cidade" TEXT,
    "uf" TEXT,
    "ocorridoEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShipmentEvent_orderId_ocorridoEm_idx" ON "ShipmentEvent"("orderId", "ocorridoEm");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentEvent_orderId_origem_codigo_ocorridoEm_key" ON "ShipmentEvent"("orderId", "origem", "codigo", "ocorridoEm");

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

