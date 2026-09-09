-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "freteContaEmail" TEXT,
ADD COLUMN     "freteContaNome" TEXT,
ADD COLUMN     "freteRefreshToken" TEXT,
ADD COLUMN     "freteTokenExpiresAt" TIMESTAMP(3);
