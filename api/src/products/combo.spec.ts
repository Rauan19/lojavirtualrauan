import { descontoDoComboCents, type RegraDeCombo } from './combo';

const regras = (r: Record<string, RegraDeCombo>) => new Map(Object.entries(r));

describe('desconto do Compre junto', () => {
  it('dá o desconto no sugerido quando os dois estão no carrinho', () => {
    const d = descontoDoComboCents(
      [
        { productId: 'camisa', precoCents: 8990, quantidade: 1 },
        { productId: 'calca', precoCents: 17990, quantidade: 1 },
      ],
      regras({ camisa: { pct: 10, sugeridos: ['calca'] } }),
    );
    expect(d).toBe(1799);
  });

  it('sem o principal ou sem o sugerido, nada', () => {
    const r = regras({ camisa: { pct: 10, sugeridos: ['calca'] } });
    expect(
      descontoDoComboCents(
        [{ productId: 'calca', precoCents: 17990, quantidade: 1 }],
        r,
      ),
    ).toBe(0);
    expect(
      descontoDoComboCents(
        [{ productId: 'camisa', precoCents: 8990, quantidade: 3 }],
        r,
      ),
    ).toBe(0);
  });

  it('uma unidade sugerida por unidade do principal', () => {
    const r = regras({ camisa: { pct: 10, sugeridos: ['meia'] } });
    // 1 camisa + 3 meias: só 1 meia com desconto
    expect(
      descontoDoComboCents(
        [
          { productId: 'camisa', precoCents: 5000, quantidade: 1 },
          { productId: 'meia', precoCents: 1000, quantidade: 3 },
        ],
        r,
      ),
    ).toBe(100);
    // 2 camisas + 3 meias: 2 meias
    expect(
      descontoDoComboCents(
        [
          { productId: 'camisa', precoCents: 5000, quantidade: 2 },
          { productId: 'meia', precoCents: 1000, quantidade: 3 },
        ],
        r,
      ),
    ).toBe(200);
  });

  it('a mesma unidade não ganha desconto duas vezes', () => {
    const d = descontoDoComboCents(
      [
        { productId: 'a', precoCents: 5000, quantidade: 1 },
        { productId: 'b', precoCents: 5000, quantidade: 1 },
        { productId: 'cinto', precoCents: 2000, quantidade: 1 },
      ],
      regras({
        a: { pct: 10, sugeridos: ['cinto'] },
        b: { pct: 20, sugeridos: ['cinto'] },
      }),
    );
    // vale o maior (20%), uma vez só
    expect(d).toBe(400);
  });

  it('dois produtos que se sugerem: cada um desconta no outro uma vez', () => {
    const d = descontoDoComboCents(
      [
        { productId: 'a', precoCents: 10000, quantidade: 1 },
        { productId: 'b', precoCents: 10000, quantidade: 1 },
      ],
      regras({
        a: { pct: 10, sugeridos: ['b'] },
        b: { pct: 10, sugeridos: ['a'] },
      }),
    );
    // b desconta em a e a desconta em b: no máximo 10% de cada
    expect(d).toBeLessThanOrEqual(2000);
  });

  it('teto de 30% mesmo com regra maior gravada', () => {
    const d = descontoDoComboCents(
      [
        { productId: 'a', precoCents: 1000, quantidade: 1 },
        { productId: 'b', precoCents: 1000, quantidade: 1 },
      ],
      regras({ a: { pct: 90, sugeridos: ['b'] } }),
    );
    expect(d).toBe(300);
  });

  it('arredonda para baixo (nunca dá centavo a mais)', () => {
    const d = descontoDoComboCents(
      [
        { productId: 'a', precoCents: 999, quantidade: 1 },
        { productId: 'b', precoCents: 999, quantidade: 1 },
      ],
      regras({ a: { pct: 15, sugeridos: ['b'] } }),
    );
    expect(d).toBe(149);
  });

  it('uma unidade de cada sugerido por unidade do principal', () => {
    const d = descontoDoComboCents(
      [
        { productId: 'camisa', precoCents: 8990, quantidade: 1 },
        { productId: 'calca', precoCents: 17990, quantidade: 1 },
        { productId: 'tenis', precoCents: 24990, quantidade: 1 },
      ],
      regras({ camisa: { pct: 10, sugeridos: ['calca', 'tenis'] } }),
    );
    // 1799 + 2499 (a caixa da vitrine mostra exatamente isso)
    expect(d).toBe(4298);
  });
});
