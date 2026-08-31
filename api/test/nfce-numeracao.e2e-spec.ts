import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { InvoicesService } from '../src/invoices/invoices.service';
import { createTestApp, resetDb, seedStore } from './helpers/test-app';

/*
 * Numeração da NFC-e.
 *
 * A sequência fiscal não admite número repetido: a SEFAZ rejeita a segunda
 * nota, e o lojista fica com pedido pago sem nota emitida — que é obrigação,
 * não escolha. Estes testes cobrem a reserva do número, que é o ponto onde
 * duas emissões simultâneas se atropelavam.
 */
describe('NFC-e — numeração (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let invoices: InvoicesService;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    invoices = app.get(InvoicesService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  /** A reserva é privada de propósito; o teste chega nela pelo serviço. */
  function reservar(storeId: string): Promise<number> {
    return (
      invoices as unknown as {
        reserveInvoiceNumber(id: string): Promise<number>;
      }
    ).reserveInvoiceNumber(storeId);
  }

  it('duas emissões simultâneas nunca pegam o mesmo número', async () => {
    const seed = await seedStore(prisma);

    const numeros = await Promise.all(
      Array.from({ length: 20 }, () => reservar(seed.store.id)),
    );

    expect(new Set(numeros).size).toBe(20);
    expect([...numeros].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );

    const store = await prisma.store.findUniqueOrThrow({
      where: { id: seed.store.id },
    });
    expect(store.nfeNextNumber).toBe(21);
  });

  it('reserva começa no número configurado pelo lojista', async () => {
    const seed = await seedStore(prisma);
    await prisma.store.update({
      where: { id: seed.store.id },
      data: { nfeNextNumber: 500 },
    });

    expect(await reservar(seed.store.id)).toBe(500);
    expect(await reservar(seed.store.id)).toBe(501);
  });

  it('lojas diferentes têm sequências independentes', async () => {
    const a = await seedStore(prisma);
    const b = await seedStore(prisma);

    expect(await reservar(a.store.id)).toBe(1);
    expect(await reservar(a.store.id)).toBe(2);
    expect(await reservar(b.store.id)).toBe(1);
  });

  it('número não é reservado quando falta configuração fiscal', async () => {
    const seed = await seedStore(prisma);
    const antes = await prisma.store.findUniqueOrThrow({
      where: { id: seed.store.id },
    });

    // loja sem token/NFe habilitada: a emissão tem que parar antes da reserva
    await expect(
      invoices.issueForOrder(seed.store.id, 'pedido-inexistente'),
    ).rejects.toThrow();

    const depois = await prisma.store.findUniqueOrThrow({
      where: { id: seed.store.id },
    });
    expect(depois.nfeNextNumber).toBe(antes.nfeNextNumber);
  });
});
