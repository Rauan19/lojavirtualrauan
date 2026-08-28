-- Reserva de estoque: o estoque passa a ser baixado na criação do pedido
-- e devolvido ao cancelar / expirar / estornar.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "stockReserved" BOOLEAN NOT NULL DEFAULT false;

-- Pedidos já pagos tiveram o estoque baixado pela regra antiga (baixa na
-- aprovação). Marca como reservado para que um estorno devolva o estoque.
UPDATE "Order"
   SET "stockReserved" = true
 WHERE "status" IN ('PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED');
