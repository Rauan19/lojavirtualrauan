-- AlterTable
ALTER TABLE "PlatformPlan" ADD COLUMN     "maxProducts" INTEGER,
ADD COLUMN     "nfeIncluded" BOOLEAN NOT NULL DEFAULT true;

-- Novo catálogo (set/2026): os planos passam a ter diferença de verdade.
-- Mexe só nos 3 planos-semente, pelo id. Plano criado à mão pelo Super Admin
-- continua como está (sem limite e com NF-e, pelos defaults acima).
--
-- Preço novo vale para cobrança nova. Assinatura de cartão já autorizada no
-- Mercado Pago continua com o valor antigo até o lojista assinar de novo.
UPDATE "PlatformPlan" SET
  "name" = 'Essencial',
  "description" = 'Para começar a vender online com marca própria.',
  "amount" = 69.90,
  "periodDays" = 30,
  "badge" = 'Para começar',
  "highlight" = false,
  "maxProducts" = 100,
  "nfeIncluded" = false,
  "features" = '["Loja completa com domínio próprio","Até 100 produtos","Pix, cartão e boleto pelo Mercado Pago","Frete pelo Melhor Envio com etiqueta e rastreio","Cupons, promoções e avaliações"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'plan-seed-essencial';

UPDATE "PlatformPlan" SET
  "name" = 'Profissional',
  "description" = 'Para a loja que já vende todo dia e emite nota.',
  "amount" = 129.90,
  "periodDays" = 30,
  "badge" = 'Mais escolhido',
  "highlight" = true,
  "maxProducts" = NULL,
  "nfeIncluded" = true,
  "features" = '["Tudo do Essencial","Produtos ilimitados","Nota fiscal automática (NF-e e NFC-e)"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'plan-seed-mensal';

UPDATE "PlatformPlan" SET
  "name" = 'Avançado',
  "description" = 'Para operação maior, com atendimento prioritário.',
  "amount" = 249.90,
  "periodDays" = 30,
  "badge" = 'Loja maior',
  "highlight" = false,
  "maxProducts" = NULL,
  "nfeIncluded" = true,
  "features" = '["Tudo do Profissional","Suporte prioritário pelo WhatsApp","Ajuda para configurar domínio, frete e nota fiscal"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'plan-seed-pro';

-- Planos anuais: 12 meses pelo preço de 10.
INSERT INTO "PlatformPlan" ("id", "name", "description", "amount", "periodDays", "badge", "highlight", "maxProducts", "nfeIncluded", "features", "active", "order", "updatedAt")
VALUES
  ('plan-seed-essencial-anual', 'Essencial', 'Pagamento anual. Equivale a R$ 58,25 por mês.', 699.00, 365, '2 meses grátis', false, 100, false,
   '["Loja completa com domínio próprio","Até 100 produtos","Pix, cartão e boleto pelo Mercado Pago","Frete pelo Melhor Envio com etiqueta e rastreio","Cupons, promoções e avaliações"]'::jsonb, true, 10, CURRENT_TIMESTAMP),
  ('plan-seed-mensal-anual', 'Profissional', 'Pagamento anual. Equivale a R$ 108,25 por mês.', 1299.00, 365, '2 meses grátis', true, NULL, true,
   '["Tudo do Essencial","Produtos ilimitados","Nota fiscal automática (NF-e e NFC-e)"]'::jsonb, true, 11, CURRENT_TIMESTAMP),
  ('plan-seed-pro-anual', 'Avançado', 'Pagamento anual. Equivale a R$ 208,25 por mês.', 2499.00, 365, '2 meses grátis', false, NULL, true,
   '["Tudo do Profissional","Suporte prioritário pelo WhatsApp","Ajuda para configurar domínio, frete e nota fiscal"]'::jsonb, true, 12, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
