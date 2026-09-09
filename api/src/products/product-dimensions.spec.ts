import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';

/**
 * Peso e dimensões só são exigidos quando a loja cota frete por
 * transportadora. Os testes param na validação: o Prisma falso devolve o
 * suficiente para chegar nela e falha alto se a gravação for tentada.
 */
function serviceFor(
  freteModo: string,
  saved: Record<string, unknown> = {},
) {
  const created = jest.fn().mockResolvedValue({ id: 'novo' });
  const prisma = {
    category: { findFirst: jest.fn().mockResolvedValue({ id: 'cat' }) },
    store: { findUnique: jest.fn().mockResolvedValue({ freteModo }) },
    product: {
      findFirst: jest.fn().mockResolvedValue({ id: 'p1', ...saved }),
      create: created,
    },
    productVariant: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockResolvedValue({ id: 'p1' }),
  };
  return {
    service: new ProductsService(prisma as never),
    prisma,
    created,
  };
}

const COMPLETO = {
  name: 'Fone',
  categoryId: 'cat',
  price: 100,
  weightKg: 0.4,
  widthCm: 12,
  heightCm: 6,
  lengthCm: 18,
};

describe('exigência de peso e dimensões no cadastro', () => {
  it('barra criação sem medida quando a loja usa Melhor Envio', async () => {
    const { service, created } = serviceFor('melhor_envio');
    const { weightKg, widthCm, ...semMedida } = COMPLETO;

    await expect(
      service.createProduct('loja', semMedida as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(created).not.toHaveBeenCalled();
  });

  it('diz quais medidas faltam', async () => {
    const { service } = serviceFor('melhor_envio');
    const { weightKg, ...semPeso } = COMPLETO;

    await expect(
      service.createProduct('loja', semPeso as never),
    ).rejects.toThrow(/peso \(kg\)/);
  });

  it.each(['frenet', 'superfrete'])(
    'vale também para %s, que também cota pela medida real',
    async (modo) => {
      const { service } = serviceFor(modo);
      const { lengthCm, ...semComprimento } = COMPLETO;

      await expect(
        service.createProduct('loja', semComprimento as never),
      ).rejects.toThrow(/comprimento/);
    },
  );

  it.each(['manual', 'gratis'])(
    'não exige nada quando o frete é %s',
    async (modo) => {
      const { service, created } = serviceFor(modo);
      const { weightKg, widthCm, heightCm, lengthCm, ...semMedida } = COMPLETO;

      await service.createProduct('loja', semMedida as never);
      expect(created).toHaveBeenCalled();
    },
  );

  it('aceita criação com todas as medidas', async () => {
    const { service, created } = serviceFor('melhor_envio');
    await service.createProduct('loja', COMPLETO as never);
    expect(created).toHaveBeenCalled();
  });

  it('medida zerada conta como ausente', async () => {
    const { service } = serviceFor('melhor_envio');
    await expect(
      service.createProduct('loja', { ...COMPLETO, weightKg: 0 } as never),
    ).rejects.toThrow(/peso/);
  });
});

describe('edição parcial', () => {
  const SALVO = { weightKg: 0.4, widthCm: 12, heightCm: 6, lengthCm: 18 };

  it('deixa mexer só no preço sem redigitar o pacote', async () => {
    const { service, prisma } = serviceFor('melhor_envio', SALVO);
    await service.updateProduct('loja', 'p1', { price: 199 } as never);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('barra quem apaga a medida de um produto já salvo', async () => {
    const { service, prisma } = serviceFor('melhor_envio', SALVO);
    await expect(
      service.updateProduct('loja', 'p1', { weightKg: null } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('barra edição de produto legado que nunca teve medida', async () => {
    const { service } = serviceFor('melhor_envio', {
      weightKg: null,
      widthCm: null,
      heightCm: null,
      lengthCm: null,
    });
    await expect(
      service.updateProduct('loja', 'p1', { price: 199 } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
