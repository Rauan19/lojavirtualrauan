import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';

/**
 * O que sai para o Mercado Pago no pagamento do Brick: com comissão, o
 * corpo leva application_fee (em R$) e o valor da comissão no metadata; sem
 * comissão, nenhum dos dois.
 */
function montar(comissao: { feeCents: number; feeReais: number } | null) {
  const pedido = {
    id: 'ped-1',
    storeId: 'loja',
    orderNumber: '000123',
    total: '100.00',
    subtotal: '90.00',
    discount: '0',
    shippingCost: '10.00',
    customerEmail: 'cliente@exemplo.com',
    customerName: 'Cliente Teste',
    customerId: null,
    shippingAddress: null,
    status: OrderStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    createdAt: new Date(),
    items: [],
    customer: null,
    platformFeeBps: null,
    platformFeeBaseCents: null,
    platformFeeCents: null,
  };
  const prisma = {
    store: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'loja',
        mpAccessToken: 'TEST-token',
        mpPublicKey: 'TEST-pk',
      }),
    },
    order: {
      findFirst: jest.fn().mockResolvedValue(pedido),
      update: jest.fn().mockResolvedValue(pedido),
    },
  };
  const config = { get: () => undefined };
  const secrets = { decryptStore: (s: unknown) => s };
  const mpOauth = { ensureFreshToken: jest.fn() };
  const platformFee = { paraPedido: jest.fn().mockResolvedValue(comissao) };
  const svc = new PaymentsService(
    prisma as never,
    config as never,
    secrets as never,
    {} as never,
    mpOauth as never,
    platformFee as never,
    { agendar: jest.fn() } as never,
  );
  return { svc };
}

describe('comissão no pagamento do Brick', () => {
  const fetchOriginal = global.fetch;
  let enviado: Record<string, unknown> | null;

  beforeEach(() => {
    enviado = null;
    global.fetch = jest.fn((_url: string, init?: { body?: string }) => {
      enviado = JSON.parse(init?.body || '{}');
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 555, status: 'pending' }),
        text: () => Promise.resolve(''),
      });
    }) as never;
  });
  afterAll(() => {
    global.fetch = fetchOriginal;
  });

  it('manda application_fee com o valor da comissão', async () => {
    const { svc } = montar({ feeCents: 180, feeReais: 1.8 });
    await svc.processBrickPayment('loja', 'ped-1', {
      payment_method_id: 'pix',
      payer: { email: 'cliente@exemplo.com' },
    });
    expect(enviado?.application_fee).toBe(1.8);
    expect(enviado?.transaction_amount).toBe(100);
    expect(
      (enviado?.metadata as Record<string, unknown>).platform_fee_cents,
    ).toBe(180);
  });

  it('sem comissão, não manda application_fee', async () => {
    const { svc } = montar(null);
    await svc.processBrickPayment('loja', 'ped-1', {
      payment_method_id: 'pix',
      payer: { email: 'cliente@exemplo.com' },
    });
    expect(enviado).not.toBeNull();
    expect(enviado?.application_fee).toBeUndefined();
  });
});
