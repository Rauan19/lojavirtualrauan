-- Lojas unificadas: tipo sempre Geral (variações definidas por produto)
UPDATE "Store" SET "storeType" = 'GENERAL' WHERE "storeType" IS DISTINCT FROM 'GENERAL';
