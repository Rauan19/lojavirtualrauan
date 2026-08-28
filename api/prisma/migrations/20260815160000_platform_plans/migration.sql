-- Planos deixam de ser fixos em código/env e passam a ser uma tabela
-- editável pelo Super Admin (nome, preço, dias, destaque, recursos).

ALTER TABLE "PlatformSettings"
  ADD COLUMN IF NOT EXISTS "trialDays" INTEGER;

CREATE TABLE IF NOT EXISTS "PlatformPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "periodDays" INTEGER NOT NULL DEFAULT 30,
    "badge" TEXT,
    "highlight" BOOLEAN NOT NULL DEFAULT false,
    "features" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlatformPlan_active_order_idx" ON "PlatformPlan"("active", "order");

-- Semente com os 3 planos que existiam fixos em código. Só roda se a
-- tabela estiver vazia — não sobrescreve planos que o Super Admin já editou.
INSERT INTO "PlatformPlan" ("id", "name", "description", "amount", "periodDays", "badge", "highlight", "features", "active", "order", "updatedAt")
SELECT * FROM (VALUES
  (
    'plan-seed-essencial',
    'Essencial',
    'Ideal para loja menor, catálogo enxuto e começo sem complicação.',
    169.90::decimal(10,2),
    30,
    'Loja menor',
    false,
    '["Loja online completa","Produtos, pedidos e frete","Mercado Pago dos seus clientes","Link da loja incluso (slug)","Domínio próprio opcional — o registro do domínio é pago por você"]'::jsonb,
    true,
    0,
    CURRENT_TIMESTAMP
  ),
  (
    'plan-seed-mensal',
    'Mensal',
    'Para loja em crescimento que já vende com mais frequência.',
    199.90::decimal(10,2),
    30,
    'Mais escolhido',
    true,
    '["Tudo do Essencial","Mais espaço pra crescer o catálogo","Painel completo de vendas","Link da loja incluso (slug)","Domínio próprio opcional — o registro do domínio é pago por você"]'::jsonb,
    true,
    1,
    CURRENT_TIMESTAMP
  ),
  (
    'plan-seed-pro',
    'Pro',
    'Para loja maior, mais volume e operação no dia a dia.',
    297.90::decimal(10,2),
    30,
    'Loja maior',
    false,
    '["Tudo do Mensal","Foco em operação com mais volume","Prioridade no suporte","Link da loja incluso (slug)","Domínio próprio opcional — o registro do domínio é pago por você"]'::jsonb,
    true,
    2,
    CURRENT_TIMESTAMP
  )
) AS seed(id, name, description, amount, "periodDays", badge, highlight, features, active, "order", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "PlatformPlan");
