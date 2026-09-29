import { ForbiddenException } from '@nestjs/common';
import { StoreStatus } from '@prisma/client';
import { PlanLimitsService } from './plan-limits.service';

const PLANOS = [
  {
    id: 'plan-seed-essencial',
    name: 'Essencial',
    periodDays: 30,
    maxProducts: 100,
    nfeIncluded: false,
  },
  {
    id: 'plan-seed-mensal',
    name: 'Profissional',
    periodDays: 30,
    maxProducts: null,
    nfeIncluded: true,
  },
  {
    id: 'plan-seed-essencial-anual',
    name: 'Essencial',
    periodDays: 365,
    maxProducts: 100,
    nfeIncluded: false,
  },
];

function montar(
  store: { status: StoreStatus; planName: string | null },
  produtos = 0,
) {
  const prisma = {
    store: { findUnique: jest.fn().mockResolvedValue(store) },
    platformPlan: { findMany: jest.fn().mockResolvedValue(PLANOS) },
    product: { count: jest.fn().mockResolvedValue(produtos) },
  };
  return new PlanLimitsService(prisma as never);
}

describe('PlanLimitsService', () => {
  it('teste grátis libera tudo, mesmo escolhendo o Essencial', async () => {
    const svc = montar(
      { status: StoreStatus.TRIAL, planName: 'plan-seed-essencial' },
      500,
    );
    await expect(svc.assertCanCreateProduct('s')).resolves.toBeUndefined();
    await expect(svc.assertNfeIncluded('s')).resolves.toBeUndefined();
  });

  it('Essencial barra o 101º produto e deixa até o 100º', async () => {
    const cheio = montar(
      { status: StoreStatus.ACTIVE, planName: 'plan-seed-essencial' },
      100,
    );
    await expect(cheio.assertCanCreateProduct('s')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(cheio.assertCanCreateProduct('s')).rejects.toThrow(
      /até 100 produtos/,
    );

    const quase = montar(
      { status: StoreStatus.ACTIVE, planName: 'plan-seed-essencial' },
      99,
    );
    await expect(quase.assertCanCreateProduct('s')).resolves.toBeUndefined();
  });

  it('Essencial não emite NF-e; Profissional emite e não tem limite de produtos', async () => {
    const ess = montar({
      status: StoreStatus.ACTIVE,
      planName: 'plan-seed-essencial',
    });
    await expect(ess.assertNfeIncluded('s')).rejects.toThrow(
      /Nota fiscal não faz parte/,
    );

    const pro = montar(
      { status: StoreStatus.ACTIVE, planName: 'plan-seed-mensal' },
      5000,
    );
    await expect(pro.assertNfeIncluded('s')).resolves.toBeUndefined();
    await expect(pro.assertCanCreateProduct('s')).resolves.toBeUndefined();
  });

  it('acha o plano pelos valores antigos de Store.planName', async () => {
    for (const antigo of ['essencial', 'Essencial', 'ESSENCIAL']) {
      const svc = montar({ status: StoreStatus.ACTIVE, planName: antigo });
      expect((await svc.forStore('s')).maxProducts).toBe(100);
    }
    const mensal = montar({ status: StoreStatus.ACTIVE, planName: 'Mensal' });
    expect((await mensal.forStore('s')).planName).toBe('Profissional');
  });

  it('plano anual tem os mesmos limites do mensal', async () => {
    const svc = montar({
      status: StoreStatus.ACTIVE,
      planName: 'plan-seed-essencial-anual',
    });
    const l = await svc.forStore('s');
    expect(l.maxProducts).toBe(100);
    expect(l.nfeIncluded).toBe(false);
  });

  it('plano desconhecido não bloqueia quem está pagando', async () => {
    const svc = montar(
      { status: StoreStatus.ACTIVE, planName: 'basic' },
      10_000,
    );
    await expect(svc.assertCanCreateProduct('s')).resolves.toBeUndefined();
    await expect(svc.assertNfeIncluded('s')).resolves.toBeUndefined();
  });
});
