import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function ensureSuperAdmin() {
  const email = (
    process.env.SUPER_ADMIN_EMAIL || 'admin@plataforma.com'
  ).toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || 'admin123';
  const name = process.env.SUPER_ADMIN_NAME || 'Super Admin';
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findFirst({
    where: { email, role: Role.SUPER_ADMIN },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, name, active: true },
    });
    console.log(`Super admin atualizado: ${email}`);
  } else {
    await prisma.user.create({
      data: { email, passwordHash, name, role: Role.SUPER_ADMIN },
    });
    console.log(`Super admin criado: ${email}`);
  }
}

ensureSuperAdmin()
  .catch(async (e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
