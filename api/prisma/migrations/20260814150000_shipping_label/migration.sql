-- Geração de etiqueta na transportadora (Melhor Envio).

-- Opt-in por loja: gerar e PAGAR a etiqueta sozinho consome saldo real,
-- então nasce desligado.
ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "freteEtiquetaAuto" BOOLEAN NOT NULL DEFAULT false;

-- Sem guardar o serviço escolhido na cotação não dá para emitir a etiqueta
-- depois (o Melhor Envio exige o id do serviço).
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "shippingServiceId" TEXT;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "labelUrl" TEXT;
