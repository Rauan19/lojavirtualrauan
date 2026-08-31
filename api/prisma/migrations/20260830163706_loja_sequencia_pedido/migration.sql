-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "orderSeq" INTEGER NOT NULL DEFAULT 0;

-- Lojas existentes continuam de onde pararam: o esquema antigo numerava por
-- count(*) + 1, então a contagem atual é exatamente o último número usado.
UPDATE "Store" SET "orderSeq" = (
  SELECT COUNT(*) FROM "Order" WHERE "Order"."storeId" = "Store"."id"
);
