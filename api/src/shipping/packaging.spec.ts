import { consolidatePackage, DEFAULT_PACKAGE, itemPackage } from './packaging';

describe('itemPackage', () => {
  it('usa a medida cadastrada quando existe', () => {
    expect(
      itemPackage({ quantity: 1, weight: 2, width: 30, height: 20, length: 40 }),
    ).toEqual({ weight: 2, width: 30, height: 20, length: 40 });
  });

  it('cai no mesmo fallback da cotação quando o produto não tem medida', () => {
    expect(itemPackage({ quantity: 1 })).toEqual({ ...DEFAULT_PACKAGE });
  });

  it.each([
    ['zero', 0],
    ['negativo', -5],
    ['nulo', null],
    ['texto', 'abc'],
  ])('trata medida %s como ausente', (_label, value) => {
    expect(
      itemPackage({
        quantity: 1,
        weight: value,
        width: value,
        height: value,
        length: value,
      }),
    ).toEqual({ ...DEFAULT_PACKAGE });
  });

  it('aceita Decimal do Prisma (objeto com toString)', () => {
    const decimal = { toString: () => '1.5', valueOf: () => 1.5 };
    expect(itemPackage({ quantity: 1, weight: decimal }).weight).toBe(1.5);
  });
});

describe('consolidatePackage', () => {
  it('soma o peso pela quantidade em vez de gerar um volume por unidade', () => {
    const pkg = consolidatePackage([
      { quantity: 3, weight: 0.4, width: 10, height: 5, length: 15 },
    ]);
    expect(pkg.weight).toBe(1.2);
  });

  it('empilha a altura e usa a maior base', () => {
    const pkg = consolidatePackage([
      { quantity: 1, weight: 1, width: 10, height: 4, length: 30 },
      { quantity: 2, weight: 1, width: 25, height: 6, length: 12 },
    ]);
    expect(pkg).toEqual({
      weight: 3,
      width: 25, // maior largura
      length: 30, // maior comprimento
      height: 16, // 4 + (6 * 2)
    });
  });

  it('devolve um pacote padrão para pedido sem itens', () => {
    expect(consolidatePackage([])).toEqual({ ...DEFAULT_PACKAGE });
  });

  it('respeita o piso de 0,1kg', () => {
    const pkg = consolidatePackage([{ quantity: 1, weight: 0.001 }]);
    expect(pkg.weight).toBeGreaterThanOrEqual(0.1);
  });

  it('nao deixa a soma de peso virar dizima', () => {
    const pkg = consolidatePackage([{ quantity: 3, weight: 0.1 }]);
    expect(pkg.weight).toBe(0.3);
  });
});
