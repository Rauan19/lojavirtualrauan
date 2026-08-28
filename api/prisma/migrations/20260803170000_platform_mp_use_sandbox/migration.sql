-- Ambiente sandbox das credenciais MP da plataforma (evita misturar TEST com init_point de produção)
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "mpUseSandbox" BOOLEAN NOT NULL DEFAULT true;
