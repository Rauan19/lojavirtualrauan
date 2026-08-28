-- Transportadoras liberadas na cotação (Melhor Envio / APIs). Null/[] = todas.
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "freteTransportadoras" JSONB;
