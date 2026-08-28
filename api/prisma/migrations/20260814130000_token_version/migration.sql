-- Revogação de sessão: um token JWT emitido antes da troca de senha
-- (ou da desativação da conta) para de valer quando esse número muda.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
