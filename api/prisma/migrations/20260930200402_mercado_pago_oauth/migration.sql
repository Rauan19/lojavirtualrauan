-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "mpConnectedAt" TIMESTAMP(3),
ADD COLUMN     "mpLiveMode" BOOLEAN,
ADD COLUMN     "mpRefreshToken" TEXT,
ADD COLUMN     "mpTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "mpUserId" TEXT;
