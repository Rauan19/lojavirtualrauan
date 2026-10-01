/**
 * Desliga a verificação em duas etapas de uma conta — para quem perdeu o
 * celular E os códigos de recuperação.
 *
 * Só roda no servidor (precisa do acesso ao banco), nunca pela internet:
 *   npm run 2fa:reset -- email@da.conta
 *
 * Também derruba as sessões abertas da conta. Se for o Super Admin, no
 * próximo login ele cai direto na tela de ativar de novo.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    console.error('Uso: npm run 2fa:reset -- email@da.conta');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const r = await prisma.user.updateMany({
      where: { email },
      data: {
        totpSecret: null,
        totpPendingSecret: null,
        totpEnabledAt: null,
        totpLastStep: null,
        totpRecoveryHashes: [],
        totpFailures: 0,
        totpLockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    });
    if (r.count === 0) {
      console.error(`Nenhuma conta com o e-mail ${email}.`);
      process.exit(1);
    }
    console.log(
      `Verificação em duas etapas desligada em ${r.count} conta(s) de ${email}. Sessões abertas encerradas.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
