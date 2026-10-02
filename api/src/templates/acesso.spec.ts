import { liberacao, type RegraTemplate, type SituacaoLoja } from './acesso';

const loja = (o: Partial<SituacaoLoja> = {}): SituacaoLoja => ({
  planName: 'plan-basico',
  emTeste: false,
  compradas: new Set(),
  ...o,
});
const t = (o: Partial<RegraTemplate>): RegraTemplate => ({
  chave: 'x',
  acesso: 'gratis',
  planos: [],
  ...o,
});

describe('quem pode usar cada template', () => {
  it('grátis: qualquer loja', () => {
    expect(liberacao(t({}), loja())).toEqual({ liberado: true, por: 'gratis' });
  });

  it('de plano: só nos planos marcados', () => {
    const pro = t({ acesso: 'plano', planos: ['plan-pro'] });
    expect(liberacao(pro, loja({ planName: 'plan-pro' }))).toEqual({
      liberado: true,
      por: 'plano',
    });
    expect(liberacao(pro, loja())).toEqual({
      liberado: false,
      precisa: 'plano',
    });
  });

  it('de plano: liberado durante o teste grátis', () => {
    const pro = t({ acesso: 'plano', planos: ['plan-pro'] });
    expect(liberacao(pro, loja({ emTeste: true }))).toEqual({
      liberado: true,
      por: 'teste',
    });
  });

  it('pago: precisa comprar, mesmo em teste', () => {
    const pago = t({ acesso: 'pago' });
    expect(liberacao(pago, loja({ emTeste: true }))).toEqual({
      liberado: false,
      precisa: 'compra',
    });
    expect(liberacao(pago, loja({ compradas: new Set(['x']) }))).toEqual({
      liberado: true,
      por: 'compra',
    });
  });

  it('pago pode vir incluso em plano', () => {
    const pago = t({ acesso: 'pago', planos: ['plan-pro'] });
    expect(liberacao(pago, loja({ planName: 'plan-pro' }))).toEqual({
      liberado: true,
      por: 'plano',
    });
  });
});
