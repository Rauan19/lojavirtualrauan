import { BadRequestException } from '@nestjs/common';
import { ProductsService, gerarCodigoProduto } from './products.service';

describe('código do produto', () => {
  it('gera VD + 6 caracteres sem letras que se confundem', () => {
    for (let i = 0; i < 200; i++) {
      expect(gerarCodigoProduto()).toMatch(/^VD[2-9A-HJKMNP-Z]{6}$/);
    }
  });

  function service(existente: { name: string } | null) {
    const create = jest.fn().mockResolvedValue({ id: 'novo' });
    const prisma = {
      category: { findFirst: jest.fn().mockResolvedValue({ id: 'cat' }) },
      store: {
        findUnique: jest.fn().mockResolvedValue({ freteModo: 'manual' }),
      },
      product: {
        findFirst: jest.fn().mockResolvedValue(existente),
        create,
      },
    };
    const svc = new ProductsService(
      prisma as never,
      { assertCanCreateProduct: jest.fn() } as never,
    );
    return { svc, create };
  }

  const base = { name: 'Perfume', price: 100, categoryId: 'cat' };

  it('sem código digitado, o produto nasce com um gerado', async () => {
    const { svc, create } = service(null);
    await svc.createProduct('loja', base as never);
    expect(create.mock.calls[0][0].data.sku).toMatch(/^VD[2-9A-HJKMNP-Z]{6}$/);
  });

  it('mantém o código que o lojista digitou', async () => {
    const { svc, create } = service(null);
    await svc.createProduct('loja', { ...base, sku: ' 789123 ' } as never);
    expect(create.mock.calls[0][0].data.sku).toBe('789123');
  });

  it('recusa código que já é de outro produto da loja', async () => {
    const { svc, create } = service({ name: 'Perfume Antigo' });
    await expect(
      svc.createProduct('loja', { ...base, sku: 'ABC' } as never),
    ).rejects.toThrow(BadRequestException);
    await expect(
      svc.createProduct('loja', { ...base, sku: 'ABC' } as never),
    ).rejects.toThrow(/já é do produto “Perfume Antigo”/);
    expect(create).not.toHaveBeenCalled();
  });
});
