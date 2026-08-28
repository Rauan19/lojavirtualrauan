import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { Prisma, Role, StoreStatus } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export type TestContext = {
  app: INestApplication;
  prisma: PrismaService;
};

/**
 * Sobe a aplicação igual à produção (mesmo ValidationPipe e prefixo), para os
 * testes exercitarem os guards de verdade em vez de chamar service na mão.
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

/** Limpa tudo entre os testes. Ordem respeita as FKs. */
export async function resetDb(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "OrderItem", "Order", "Address", "Customer", "ProductVariant",
      "ProductImage", "Product", "Category", "Coupon", "Promotion",
      "Invoice", "PlatformInvoice", "PasswordResetToken", "User", "Store",
      "PlatformSettings"
    RESTART IDENTITY CASCADE
  `);
}

let storeCounter = 0;

export type SeededStore = Awaited<ReturnType<typeof seedStore>>;

/** Loja completa: admin, categoria, produto com estoque e frete fixo. */
export async function seedStore(
  prisma: PrismaService,
  overrides: {
    slug?: string;
    status?: StoreStatus;
    planDueAt?: Date | null;
    stock?: number;
    price?: number;
    freteValorFixo?: number;
  } = {},
) {
  storeCounter++;
  const slug = overrides.slug || `loja-teste-${storeCounter}`;

  const store = await prisma.store.create({
    data: {
      name: `Loja Teste ${storeCounter}`,
      slug,
      status: overrides.status ?? StoreStatus.ACTIVE,
      planDueAt:
        overrides.planDueAt === undefined
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          : overrides.planDueAt,
      monthlyFee: new Prisma.Decimal(199.9),
      // manual = tabela própria, sem chamar API externa no teste
      freteModo: 'manual',
      freteValorFixo: new Prisma.Decimal(overrides.freteValorFixo ?? 25),
    },
  });

  const adminPassword = 'senha-admin-123';
  const admin = await prisma.user.create({
    data: {
      email: `admin-${storeCounter}@teste.local`,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      name: 'Admin Teste',
      role: Role.STORE_ADMIN,
      storeId: store.id,
    },
  });

  const category = await prisma.category.create({
    data: { storeId: store.id, name: 'Geral', slug: 'geral' },
  });

  const product = await prisma.product.create({
    data: {
      storeId: store.id,
      categoryId: category.id,
      name: 'Camiseta Teste',
      slug: 'camiseta-teste',
      price: new Prisma.Decimal(overrides.price ?? 100),
      stock: overrides.stock ?? 10,
      active: true,
      weightKg: new Prisma.Decimal(0.3),
      widthCm: new Prisma.Decimal(20),
      heightCm: new Prisma.Decimal(5),
      lengthCm: new Prisma.Decimal(30),
    },
  });

  const customerPassword = 'senha-cliente-123';
  const customer = await prisma.customer.create({
    data: {
      storeId: store.id,
      email: `cliente-${storeCounter}@teste.local`,
      name: 'Cliente Teste',
      passwordHash: await bcrypt.hash(customerPassword, 10),
    },
  });

  return {
    store,
    admin: { ...admin, password: adminPassword },
    category,
    product,
    customer: { ...customer, password: customerPassword },
  };
}

/**
 * Assina um token de cliente sem passar pelo endpoint de login.
 *
 * O login tem rate limit de 8/min por IP e a suíte inteira sai do mesmo IP —
 * autenticar por HTTP em todo `beforeEach` faria os testes se derrubarem com
 * 429. O login em si é coberto em seguranca.e2e-spec.ts.
 */
export async function signCustomerToken(
  app: INestApplication,
  customer: { id: string; email: string; storeId: string; tokenVersion: number },
) {
  const jwt = app.get(JwtService);
  return jwt.signAsync(
    {
      sub: customer.id,
      email: customer.email,
      role: Role.CUSTOMER,
      storeId: customer.storeId,
      typ: 'customer',
      tv: customer.tokenVersion,
    },
    {
      secret: process.env.JWT_SECRET,
      expiresIn: '1d',
    },
  );
}

/** Idem para admin da loja. */
export async function signAdminToken(
  app: INestApplication,
  user: {
    id: string;
    email: string;
    role: Role;
    storeId: string | null;
    tokenVersion: number;
  },
) {
  const jwt = app.get(JwtService);
  return jwt.signAsync(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
      tv: user.tokenVersion,
    },
    { secret: process.env.JWT_SECRET, expiresIn: '1d' },
  );
}

export const ADDRESS = {
  zipCode: '01310100',
  street: 'Avenida Paulista',
  number: '1000',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
};
