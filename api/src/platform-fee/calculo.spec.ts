import { calcularComissao, paraCentavos } from './calculo';

describe('calcularComissao', () => {
  it('2% sobre os produtos, sem o frete', () => {
    // R$ 90 de produtos + R$ 10 de frete = R$ 100 pagos
    const c = calcularComissao({
      subtotalCents: 9000,
      discountCents: 0,
      totalCents: 10000,
      bps: 200,
    });
    expect(c).toEqual({ bps: 200, baseCents: 9000, feeCents: 180 });
  });

  it('desconta o cupom antes de calcular', () => {
    const c = calcularComissao({
      subtotalCents: 10000,
      discountCents: 2000,
      totalCents: 8000,
      bps: 100,
    });
    expect(c.baseCents).toBe(8000);
    expect(c.feeCents).toBe(80);
  });

  it('arredonda para baixo (centavo quebrado fica com o lojista)', () => {
    // 0,5% de R$ 19,99 = 9,995 centavos → 9
    const c = calcularComissao({
      subtotalCents: 1999,
      discountCents: 0,
      totalCents: 1999,
      bps: 50,
    });
    expect(c.feeCents).toBe(9);
  });

  it('menos de 1 centavo não é cobrado', () => {
    const c = calcularComissao({
      subtotalCents: 50,
      discountCents: 0,
      totalCents: 50,
      bps: 50,
    });
    expect(c.feeCents).toBe(0);
  });

  it('sem taxa no plano, sem comissão', () => {
    expect(
      calcularComissao({
        subtotalCents: 10000,
        discountCents: 0,
        totalCents: 10000,
        bps: 0,
      }).feeCents,
    ).toBe(0);
  });

  it('desconto maior que o subtotal não gera base negativa', () => {
    const c = calcularComissao({
      subtotalCents: 1000,
      discountCents: 5000,
      totalCents: 500,
      bps: 200,
    });
    expect(c.baseCents).toBe(0);
    expect(c.feeCents).toBe(0);
  });

  it('nunca chega ao valor total da venda', () => {
    const c = calcularComissao({
      subtotalCents: 10000,
      discountCents: 0,
      totalCents: 100,
      bps: 1000,
    });
    expect(c.feeCents).toBeLessThan(100);
  });

  it('converte reais para centavos sem erro de ponto flutuante', () => {
    expect(paraCentavos('19.99')).toBe(1999);
    expect(paraCentavos(0.1 + 0.2)).toBe(30);
    expect(paraCentavos('lixo')).toBe(0);
  });
});
