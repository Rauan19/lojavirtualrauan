import {
  comissaoRetida,
  lancamentosEsperados,
  type PagamentoMp,
} from './livro';

const pgto = (extra: Partial<PagamentoMp> = {}): PagamentoMp => ({
  id: 99,
  status: 'approved',
  transaction_amount: 100,
  fee_details: [
    { type: 'mercadopago_fee', amount: 4.99 },
    { type: 'application_fee', amount: 1.8 },
  ],
  ...extra,
});

const soma = (ls: { amountCents: number }[]) =>
  ls.reduce((s, l) => s + l.amountCents, 0);

describe('livro de comissões', () => {
  it('lê só a application_fee, não a tarifa do Mercado Pago', () => {
    expect(comissaoRetida(pgto())).toBe(180);
  });

  it('pagamento aprovado: um lançamento de cobrança', () => {
    expect(lancamentosEsperados(pgto())).toEqual([
      {
        type: 'CHARGE',
        amountCents: 180,
        idempotencyKey: 'charge:99',
        mpPaymentId: '99',
      },
    ]);
  });

  it('pendente, recusado ou sem comissão: nada no livro', () => {
    expect(lancamentosEsperados(pgto({ status: 'pending' }))).toEqual([]);
    expect(lancamentosEsperados(pgto({ status: 'rejected' }))).toEqual([]);
    expect(lancamentosEsperados(pgto({ fee_details: [] }))).toEqual([]);
  });

  it('estorno parcial devolve a comissão na mesma proporção', () => {
    const ls = lancamentosEsperados(
      pgto({ refunds: [{ id: 1, amount: 25, status: 'approved' }] }),
    );
    expect(ls[1]).toMatchObject({
      type: 'REFUND',
      amountCents: -45,
      idempotencyKey: 'refund:99:1',
    });
    expect(soma(ls)).toBe(135);
  });

  it('vários estornos que somam o total zeram a comissão sem sobrar centavo', () => {
    const ls = lancamentosEsperados(
      pgto({
        status: 'refunded',
        refunds: [
          { id: 1, amount: 33.33, status: 'approved' },
          { id: 2, amount: 33.33, status: 'approved' },
          { id: 3, amount: 33.34, status: 'approved' },
        ],
      }),
    );
    expect(soma(ls)).toBe(0);
    expect(ls.filter((l) => l.type === 'REFUND')).toHaveLength(3);
  });

  it('reembolso total sem a lista de estornos devolve tudo', () => {
    const ls = lancamentosEsperados(pgto({ status: 'refunded' }));
    expect(soma(ls)).toBe(0);
    expect(ls[1].idempotencyKey).toBe('refund:99:saldo');
  });

  it('estorno recusado não conta', () => {
    const ls = lancamentosEsperados(
      pgto({ refunds: [{ id: 1, amount: 50, status: 'rejected' }] }),
    );
    expect(soma(ls)).toBe(180);
  });

  it('as chaves são as mesmas a cada rodada (idempotente)', () => {
    const p = pgto({ refunds: [{ id: 7, amount: 10, status: 'approved' }] });
    expect(lancamentosEsperados(p)).toEqual(lancamentosEsperados(p));
  });

  it('chargeback: a comissão restante sai do livro', () => {
    const ls = lancamentosEsperados(
      pgto({
        status: 'charged_back',
        refunds: [{ id: 1, amount: 50, status: 'approved' }],
      }),
    );
    expect(ls.map((l) => l.type)).toEqual(['CHARGE', 'REFUND', 'CHARGEBACK']);
    expect(soma(ls)).toBe(0);
  });

  it('chargeback revertido volta com um ajuste', () => {
    const ls = lancamentosEsperados(pgto(), new Set(['chargeback:99']));
    expect(ls[ls.length - 1]).toMatchObject({
      type: 'ADJUSTMENT',
      amountCents: 180,
      idempotencyKey: 'chargeback-revertido:99',
    });
  });
});
