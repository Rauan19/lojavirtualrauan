import { descontoPixCentavos, ehPix } from './desconto-pix';

describe('desconto no Pix', () => {
  it('5% sobre os produtos, sem o frete', () => {
    expect(
      descontoPixCentavos({
        subtotalCents: 10000,
        descontoCents: 0,
        percentual: 5,
      }),
    ).toBe(500);
  });

  it('depois do cupom', () => {
    expect(
      descontoPixCentavos({
        subtotalCents: 10000,
        descontoCents: 2000,
        percentual: 5,
      }),
    ).toBe(400);
  });

  it('arredonda para baixo, a favor do lojista', () => {
    expect(
      descontoPixCentavos({
        subtotalCents: 9999,
        descontoCents: 0,
        percentual: 5,
      }),
    ).toBe(499);
  });

  it('sem desconto configurado ou valor estranho, zero', () => {
    expect(
      descontoPixCentavos({
        subtotalCents: 10000,
        descontoCents: 0,
        percentual: 0,
      }),
    ).toBe(0);
    expect(
      descontoPixCentavos({
        subtotalCents: 10000,
        descontoCents: 0,
        percentual: Number.NaN,
      }),
    ).toBe(0);
  });

  it('teto de 50% (proteção contra digitação errada)', () => {
    expect(
      descontoPixCentavos({
        subtotalCents: 10000,
        descontoCents: 0,
        percentual: 90,
      }),
    ).toBe(5000);
  });

  it('reconhece Pix', () => {
    expect(ehPix('pix')).toBe(true);
    expect(ehPix('PIX')).toBe(true);
    expect(ehPix('visa')).toBe(false);
  });
});
