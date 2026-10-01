-- "Compre junto": produtos sugeridos para levar com este
ALTER TABLE "Product" ADD COLUMN "buyTogetherIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
