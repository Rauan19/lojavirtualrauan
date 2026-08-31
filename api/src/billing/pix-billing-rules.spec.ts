import { StoreStatus } from '@prisma/client';
import {
  ANTECEDENCIA_DIAS,
  LEMBRETE_APOS_DIAS,
  VALIDADE_DIAS,
  decidirCobrancaPix,
  deveLembrar,
  documentoDoPagador,
  validadeDaCobranca,
} from './pix-billing-rules';

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-03-10T12:00:00Z');
const emDias = (d: number) => new Date(AGORA.getTime() + d * DIA);

function loja(over: Partial<Parameters<typeof decidirCobrancaPix>[0]['loja']> = {}) {
  return {
    billingMethod: 'PIX',
    status: StoreStatus.ACTIVE,
    planDueAt: emDias(3),
    ...over,
  };
}

/*
 * É aqui que mora o risco de cobrar duas vezes ou de esquecer de cobrar. Por
 * isso a decisão é função pura: dá para varrer as datas todas sem banco e sem
 * Mercado Pago.
 */
describe('mensalidade por Pix — quando gerar a cobrança', () => {
  it('gera quando entra na janela de antecedência', () => {
    const d = decidirCobrancaPix({
      loja: loja({ planDueAt: emDias(ANTECEDENCIA_DIAS - 1) }),
      cobrancaAberta: null,
      agora: AGORA,
    });
    expect(d).toEqual({ gerar: true });
  });

  it('gera no dia exato em que a janela abre', () => {
    const d = decidirCobrancaPix({
      loja: loja({ planDueAt: emDias(ANTECEDENCIA_DIAS) }),
      cobrancaAberta: null,
      agora: AGORA,
    });
    expect(d).toEqual({ gerar: true });
  });

  it('não gera antes da janela', () => {
    const d = decidirCobrancaPix({
      loja: loja({ planDueAt: emDias(ANTECEDENCIA_DIAS + 1) }),
      cobrancaAberta: null,
      agora: AGORA,
    });
    expect(d).toEqual({ gerar: false, motivo: 'ainda_cedo' });
  });

  it('gera para quem já venceu', () => {
    const d = decidirCobrancaPix({
      loja: loja({ planDueAt: emDias(-4), status: StoreStatus.PAST_DUE }),
      cobrancaAberta: null,
      agora: AGORA,
    });
    expect(d).toEqual({ gerar: true });
  });

  it('ignora loja que paga no cartão', () => {
    const d = decidirCobrancaPix({
      loja: loja({ billingMethod: 'CARD' }),
      cobrancaAberta: null,
      agora: AGORA,
    });
    expect(d).toEqual({ gerar: false, motivo: 'nao_e_pix' });
  });

  it('ignora loja sem método definido', () => {
    const d = decidirCobrancaPix({
      loja: loja({ billingMethod: null }),
      cobrancaAberta: null,
      agora: AGORA,
    });
    expect(d).toEqual({ gerar: false, motivo: 'nao_e_pix' });
  });

  it('ignora loja suspensa — ela gera pelo painel, não automaticamente', () => {
    const d = decidirCobrancaPix({
      loja: loja({ status: StoreStatus.SUSPENDED }),
      cobrancaAberta: null,
      agora: AGORA,
    });
    expect(d).toEqual({ gerar: false, motivo: 'status_nao_cobravel' });
  });

  it('ignora loja sem vencimento definido', () => {
    const d = decidirCobrancaPix({
      loja: loja({ planDueAt: null }),
      cobrancaAberta: null,
      agora: AGORA,
    });
    expect(d).toEqual({ gerar: false, motivo: 'sem_vencimento' });
  });

  describe('não cobra duas vezes', () => {
    it('cobrança aberta e válida bloqueia', () => {
      const d = decidirCobrancaPix({
        loja: loja(),
        cobrancaAberta: { pixExpiresAt: emDias(6) },
        agora: AGORA,
      });
      expect(d).toEqual({ gerar: false, motivo: 'ja_tem_cobranca_aberta' });
    });

    it('cobrança aberta sem validade bloqueia', () => {
      const d = decidirCobrancaPix({
        loja: loja(),
        cobrancaAberta: { pixExpiresAt: null },
        agora: AGORA,
      });
      expect(d).toEqual({ gerar: false, motivo: 'ja_tem_cobranca_aberta' });
    });

    it('cobrança expirada libera uma nova', () => {
      const d = decidirCobrancaPix({
        loja: loja(),
        cobrancaAberta: { pixExpiresAt: emDias(-1) },
        agora: AGORA,
      });
      expect(d).toEqual({ gerar: true });
    });

    it('expirada mas ainda fora da janela continua sem gerar', () => {
      const d = decidirCobrancaPix({
        loja: loja({ planDueAt: emDias(30) }),
        cobrancaAberta: { pixExpiresAt: emDias(-1) },
        agora: AGORA,
      });
      expect(d).toEqual({ gerar: false, motivo: 'ainda_cedo' });
    });
  });

  it('a validade cobre a antecedência mais a carência de suspensão', () => {
    const validade = validadeDaCobranca(AGORA);
    expect(validade.getTime() - AGORA.getTime()).toBe(VALIDADE_DIAS * DIA);
    // não adianta uma cobrança que morre antes de a loja ser suspensa
    expect(VALIDADE_DIAS).toBeGreaterThan(ANTECEDENCIA_DIAS);
  });
});

describe('documento do pagador no Pix', () => {
  it('reconhece CPF pelo tamanho', () => {
    expect(documentoDoPagador('CPF', '390.533.447-05')).toEqual({
      type: 'CPF',
      number: '39053344705',
    });
  });

  it('reconhece CNPJ pelo tamanho, mesmo com tipo errado', () => {
    // o tamanho manda: tipo trocado no cadastro não pode derrubar a cobrança
    expect(documentoDoPagador('CPF', '12.345.678/0001-99')).toEqual({
      type: 'CNPJ',
      number: '12345678000199',
    });
  });

  it('devolve nulo sem documento — o Mercado Pago exige e a API recusaria', () => {
    expect(documentoDoPagador('CPF', null)).toBeNull();
    expect(documentoDoPagador(null, '')).toBeNull();
    expect(documentoDoPagador(null, 'abc')).toBeNull();
  });
});

describe('lembrete de mensalidade vencida', () => {
  it('lembra no dia seguinte ao vencimento', () => {
    expect(
      deveLembrar({
        dueAt: emDias(-LEMBRETE_APOS_DIAS),
        lembreteEnviadoEm: null,
        agora: AGORA,
      }),
    ).toBe(true);
  });

  it('não lembra antes de vencer', () => {
    expect(
      deveLembrar({ dueAt: emDias(2), lembreteEnviadoEm: null, agora: AGORA }),
    ).toBe(false);
  });

  it('não lembra no próprio dia do vencimento', () => {
    expect(
      deveLembrar({ dueAt: AGORA, lembreteEnviadoEm: null, agora: AGORA }),
    ).toBe(false);
  });

  it('lembra uma vez só — insistir todo dia vira spam', () => {
    expect(
      deveLembrar({
        dueAt: emDias(-5),
        lembreteEnviadoEm: emDias(-4),
        agora: AGORA,
      }),
    ).toBe(false);
  });

  it('fatura sem vencimento não gera lembrete', () => {
    expect(
      deveLembrar({ dueAt: null, lembreteEnviadoEm: null, agora: AGORA }),
    ).toBe(false);
  });
});
