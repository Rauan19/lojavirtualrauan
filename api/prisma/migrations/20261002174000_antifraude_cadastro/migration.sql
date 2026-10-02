-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "alertasCadastro" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Store_sellerDocument_idx" ON "Store"("sellerDocument");
