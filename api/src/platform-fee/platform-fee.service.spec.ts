import { BadRequestException } from '@nestjs/common';
import { PlatformFeeService } from './platform-fee.service';

type Loja = {
  platformFeeEnabled: boolean | null;
  mpRefreshToken: string | null;
  termsVersion?: string | null;
};

function montar(opts: {
  env?: Record<string, string>;
  loja?: Loja;
  feeBps?: number;
}) {
  const loja: Loja = {
    termsVersion: '2026-09-30',
    ...(opts.loja ?? { platformFeeEnabled: null, mpRefreshToken: 'enc.v1.x' }),
  };
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    store: { findUnique: jest.fn().mockResolvedValue(loja) },
    order: { updateMany },
  };
  const config = {
    get: (k: string) => ({ PLATFORM_FEE_ENABLED: 'true', ...opts.env })[k],
  };
  const planLimits = {
    forStore: jest.fn().mockResolvedValue({ feeBps: opts.feeBps ?? 200 }),
  };
  const svc = new PlatformFeeService(
    prisma as never,
    config as never,
    planLimits as never,
  );
  return { svc, updateMany, planLimits };
}

const pedido = (extra: Record<string, unknown> = {}) => ({
  id: 'ped-1',
  subtotal: '90.00',
  discount: '0',
  total: '100.00',
  platformFeeBps: null,
  platformFeeBaseCents: null,
  platformFeeCents: null,
  ...extra,
});

describe('PlatformFeeService', () => {
  it('calcula 2% dos produtos (sem frete) e grava a fotografia no pedido', async () => {
    const { svc, updateMany } = montar({});
    const c = await svc.paraPedido('loja', pedido());
    expect(c).toEqual({
      bps: 200,
      baseCents: 9000,
      feeCents: 180,
      feeReais: 1.8,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'ped-1', platformFeeCents: null },
      data: {
        platformFeeBps: 200,
        platformFeeBaseCents: 9000,
        platformFeeCents: 180,
      },
    });
  });

  it('desligada no geral: não cobra', async () => {
    const { svc } = montar({ env: { PLATFORM_FEE_ENABLED: 'false' } });
    expect(await svc.paraPedido('loja', pedido())).toBeNull();
  });

  it('a loja pode forçar ligada mesmo com o geral desligado (liberação aos poucos)', async () => {
    const { svc } = montar({
      env: { PLATFORM_FEE_ENABLED: 'false' },
      loja: { platformFeeEnabled: true, mpRefreshToken: 'x' },
    });
    expect((await svc.paraPedido('loja', pedido()))?.feeCents).toBe(180);
  });

  it('a loja pode forçar desligada (botão de emergência)', async () => {
    const { svc } = montar({
      loja: { platformFeeEnabled: false, mpRefreshToken: 'x' },
    });
    expect(await svc.paraPedido('loja', pedido())).toBeNull();
  });

  it('plano sem taxa: não cobra', async () => {
    const { svc } = montar({ feeBps: 0 });
    expect(await svc.paraPedido('loja', pedido())).toBeNull();
  });

  it('segunda tentativa de pagamento reaproveita a fotografia, mesmo se o plano mudou', async () => {
    const { svc, planLimits, updateMany } = montar({ feeBps: 50 });
    const c = await svc.paraPedido(
      'loja',
      pedido({
        platformFeeBps: 200,
        platformFeeBaseCents: 9000,
        platformFeeCents: 180,
      }),
    );
    expect(c?.feeCents).toBe(180);
    expect(planLimits.forStore).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('sem Mercado Pago conectado, durante a migração vende sem comissão', async () => {
    const { svc } = montar({
      env: { PLATFORM_FEE_OAUTH_DEADLINE: '2999-01-01' },
      loja: { platformFeeEnabled: null, mpRefreshToken: null },
    });
    expect(await svc.paraPedido('loja', pedido())).toBeNull();
  });

  it('sem aceitar os termos com a taxa, não cobra (durante a migração)', async () => {
    const { svc } = montar({
      env: { PLATFORM_FEE_OAUTH_DEADLINE: '2999-01-01' },
      loja: {
        platformFeeEnabled: null,
        mpRefreshToken: 'x',
        termsVersion: '2026-09-29',
      },
    });
    expect(await svc.paraPedido('loja', pedido())).toBeNull();
  });

  it('sem Mercado Pago conectado, depois do prazo recusa o pagamento', async () => {
    const { svc } = montar({
      env: { PLATFORM_FEE_OAUTH_DEADLINE: '2020-01-01' },
      loja: { platformFeeEnabled: null, mpRefreshToken: null },
    });
    await expect(svc.paraPedido('loja', pedido())).rejects.toThrow(
      BadRequestException,
    );
  });
});
