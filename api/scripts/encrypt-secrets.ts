/**
 * Cifra os tokens de gateway que ainda estão em texto puro no banco.
 *
 * Rodar UMA vez depois de definir ENCRYPTION_KEY:
 *   npx tsx scripts/encrypt-secrets.ts
 *
 * É idempotente: valor já cifrado (prefixo `enc.v1.`) é pulado.
 * Faça backup do Postgres antes — sem a ENCRYPTION_KEY os tokens não voltam.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  encryptSecret,
  isEncrypted,
  resolveEncryptionKey,
} from '../src/common/utils/secret-crypto';

const STORE_FIELDS = [
  'mpAccessToken',
  'freteToken',
  'nfeApiToken',
  'nfeCscToken',
] as const;

async function main() {
  const key = resolveEncryptionKey(process.env.ENCRYPTION_KEY);
  if (!key) {
    console.error(
      'ENCRYPTION_KEY não definida. Gere uma com:\n' +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  let storeChanges = 0;

  const stores = await prisma.store.findMany({
    select: {
      id: true,
      slug: true,
      mpAccessToken: true,
      freteToken: true,
      nfeApiToken: true,
      nfeCscToken: true,
    },
  });

  for (const store of stores) {
    const data: Record<string, string> = {};
    for (const field of STORE_FIELDS) {
      const value = store[field];
      if (value && !isEncrypted(value)) {
        const encrypted = encryptSecret(value, key);
        if (encrypted) data[field] = encrypted;
      }
    }
    if (Object.keys(data).length === 0) continue;

    await prisma.store.update({ where: { id: store.id }, data });
    storeChanges++;
    console.log(`loja ${store.slug}: ${Object.keys(data).join(', ')}`);
  }

  const settings = await prisma.platformSettings.findUnique({
    where: { id: 'default' },
    select: { mpAccessToken: true },
  });
  let platformChanged = false;
  if (settings?.mpAccessToken && !isEncrypted(settings.mpAccessToken)) {
    await prisma.platformSettings.update({
      where: { id: 'default' },
      data: { mpAccessToken: encryptSecret(settings.mpAccessToken, key) },
    });
    platformChanged = true;
    console.log('plataforma: mpAccessToken');
  }

  console.log(
    `\nPronto. ${storeChanges} loja(s) atualizada(s)` +
      `${platformChanged ? ' + credencial da plataforma' : ''}.`,
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
