-- AlterTable
ALTER TABLE "PlatformPlan" ADD COLUMN     "maxUsers" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "storeOwner" BOOLEAN NOT NULL DEFAULT true;

-- Limite de pessoas por plano (contando o dono): grátis só o dono
UPDATE "PlatformPlan" SET "maxUsers" = 1 WHERE "id" IN ('plan-seed-comeco');
UPDATE "PlatformPlan" SET "maxUsers" = 2 WHERE "id" IN ('plan-seed-essencial', 'plan-seed-essencial-anual');
UPDATE "PlatformPlan" SET "maxUsers" = 3 WHERE "id" IN ('plan-seed-mensal', 'plan-seed-mensal-anual');
UPDATE "PlatformPlan" SET "maxUsers" = 10 WHERE "id" IN ('plan-seed-pro', 'plan-seed-pro-anual');
