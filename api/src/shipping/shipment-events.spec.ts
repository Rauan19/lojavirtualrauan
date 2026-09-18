import {
  eventosDoMelhorEnvio,
  eventosDosCorreios,
} from './shipment-events.service';

/**
 * Os dois parsers leem resposta de terceiro, que muda sem aviso. A regra aqui
 * é: evento sem data não entra (não dá para ordenar na linha do tempo), evento
 * sem cidade entra mesmo assim (ainda diz o que aconteceu).
 */
describe('marcos do Melhor Envio', () => {
  it('vira linha do tempo a partir das datas que existem', () => {
    const eventos = eventosDoMelhorEnvio({
      status: 'posted',
      generated_at: '2026-09-18 13:38:20',
      posted_at: '2026-09-18 13:55:05',
      delivered_at: null,
      canceled_at: null,
    });

    expect(eventos.map((e) => e.descricao)).toEqual([
      'Etiqueta emitida',
      'Postado na transportadora',
    ]);
    expect(eventos[0].origem).toBe('melhor_envio');
    expect(eventos[1].ocorridoEm.toISOString()).toContain('2026-09-18');
  });

  it('marco sem data nao aconteceu', () => {
    expect(eventosDoMelhorEnvio({ delivered_at: null })).toHaveLength(0);
    expect(eventosDoMelhorEnvio({})).toHaveLength(0);
  });

  it('nao quebra com resposta estranha', () => {
    expect(eventosDoMelhorEnvio(null)).toEqual([]);
    expect(eventosDoMelhorEnvio('nao e objeto')).toEqual([]);
    expect(eventosDoMelhorEnvio({ posted_at: 'data invalida' })).toEqual([]);
  });
});

describe('eventos dos Correios', () => {
  const resposta = {
    objetos: [
      {
        eventos: [
          {
            codigo: 'BDE',
            descricao: 'Objeto entregue ao destinatário',
            dtHrCriado: '2026-09-22T14:10:00',
            unidade: {
              nome: 'Unidade de Distribuição',
              endereco: { cidade: 'Campinas', uf: 'sp' },
            },
          },
          {
            codigo: 'OEC',
            descricao: 'Objeto saiu para entrega ao destinatário',
            dtHrCriado: '2026-09-22T08:02:00',
            unidade: { endereco: { cidade: 'Campinas', uf: 'SP' } },
          },
          {
            codigo: 'RO',
            descricao: 'Objeto em trânsito',
            dtHrCriado: '2026-09-20T22:40:00',
            unidade: { nome: 'CTE Salvador' },
          },
        ],
      },
    ],
  };

  it('le codigo, descricao, cidade e UF', () => {
    const eventos = eventosDosCorreios(resposta);
    expect(eventos).toHaveLength(3);

    expect(eventos[0]).toMatchObject({
      origem: 'correios',
      codigo: 'BDE',
      descricao: 'Objeto entregue ao destinatário',
      cidade: 'Campinas',
      uf: 'SP', // normaliza para maiusculo
    });
  });

  it('usa o nome da unidade quando nao vem endereco', () => {
    const eventos = eventosDosCorreios(resposta);
    const transito = eventos.find((e) => e.codigo === 'RO');
    expect(transito?.cidade).toBe('CTE Salvador');
    expect(transito?.uf).toBeNull();
  });

  it('descarta evento sem data — nao da para ordenar', () => {
    const eventos = eventosDosCorreios({
      objetos: [{ eventos: [{ codigo: 'X', descricao: 'Sem data' }] }],
    });
    expect(eventos).toHaveLength(0);
  });

  it('descarta evento sem descricao — nao diz nada ao cliente', () => {
    const eventos = eventosDosCorreios({
      objetos: [{ eventos: [{ codigo: 'X', dtHrCriado: '2026-09-20T10:00:00' }] }],
    });
    expect(eventos).toHaveLength(0);
  });

  it.each([
    ['nulo', null],
    ['vazio', {}],
    ['sem objetos', { objetos: [] }],
    ['sem eventos', { objetos: [{}] }],
  ])('nao quebra com resposta %s', (_rotulo, entrada) => {
    expect(eventosDosCorreios(entrada)).toEqual([]);
  });

  it('aceita os outros nomes de campo de data que o SRO usa', () => {
    const eventos = eventosDosCorreios({
      objetos: [
        {
          eventos: [
            { codigo: 'A', descricao: 'Com dtHrCriacao', dtHrCriacao: '2026-09-20T10:00:00' },
            { codigo: 'B', descricao: 'Com data', data: '2026-09-21T10:00:00' },
          ],
        },
      ],
    });
    expect(eventos.map((e) => e.codigo)).toEqual(['A', 'B']);
  });
});
