-- Todo produto passa a ter código (como o da Shein): o cliente fala "quero o
-- VD7K3M9Q" e o lojista acha na busca. Produto novo já nasce com código
-- (ProductsService.resolverCodigo); aqui só completa os que estão sem.
--
-- VD + 6 caracteres, sem 0/O/1/I/L. Colisão na mesma loja é praticamente
-- impossível (31^6 ≈ 887 milhões), e a loop abaixo refaz se acontecer.
DO $$
DECLARE
  alfabeto CONSTANT text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  prod RECORD;
  novo text;
BEGIN
  FOR prod IN SELECT id, "storeId" FROM "Product" WHERE sku IS NULL OR btrim(sku) = '' LOOP
    LOOP
      novo := 'VD';
      FOR i IN 1..6 LOOP
        novo := novo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "Product" WHERE "storeId" = prod."storeId" AND sku = novo
      );
    END LOOP;
    UPDATE "Product" SET sku = novo WHERE id = prod.id;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS "Product_storeId_sku_idx" ON "Product"("storeId", "sku");
