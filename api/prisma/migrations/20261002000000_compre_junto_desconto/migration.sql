-- Desconto do "Compre junto" (%), aplicado nos sugeridos levados junto
ALTER TABLE "Product" ADD COLUMN "buyTogetherDiscountPct" INTEGER NOT NULL DEFAULT 0;
