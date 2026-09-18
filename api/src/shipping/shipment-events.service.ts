import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Linha do tempo do envio, para o cliente acompanhar sem sair da loja.
 *
 * Duas origens, porque nenhuma sozinha basta:
 *
 * - O Melhor Envio devolve só marcos com data (gerado, postado, entregue). Não
 *   tem cidade nem trajeto, mas vale para qualquer transportadora que eles
 *   vendam.
 * - Os Correios devolvem o caminho com unidade e cidade. Cobrem PAC e SEDEX,
 *   que é a maior parte do que sai por ali, e essa resposta já era buscada
 *   aqui — os eventos eram lidos só para decidir "enviado ou entregue" e
 *   jogados fora em seguida.
 */

export type EventoRastreio = {
  origem: 'correios' | 'melhor_envio';
  codigo: string;
  descricao: string;
  cidade?: string | null;
  uf?: string | null;
  ocorridoEm: Date;
};

/** Marcos do Melhor Envio: nome do campo → como o cliente lê. */
const MARCOS_ME: Array<[string, string]> = [
  ['generated_at', 'Etiqueta emitida'],
  ['posted_at', 'Postado na transportadora'],
  ['delivered_at', 'Entregue'],
  ['canceled_at', 'Envio cancelado'],
];

function data(valor: unknown): Date | null {
  if (!valor) return null;
  const d = new Date(String(valor).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function texto(valor: unknown): string {
  return valor == null ? '' : String(valor).trim();
}

/** Marcos do Melhor Envio viram eventos. Sem data, o marco não aconteceu. */
export function eventosDoMelhorEnvio(envio: unknown): EventoRastreio[] {
  const o = (envio || {}) as Record<string, unknown>;
  return MARCOS_ME.flatMap(([campo, descricao]) => {
    const quando = data(o[campo]);
    return quando
      ? [
          {
            origem: 'melhor_envio' as const,
            codigo: campo,
            descricao,
            ocorridoEm: quando,
          },
        ]
      : [];
  });
}

/**
 * Eventos da consulta pública dos Correios.
 *
 * O formato do SRO varia entre respostas — a unidade às vezes vem com
 * `endereco`, às vezes não vem nada. Por isso cada campo é lido com tolerância:
 * evento sem cidade ainda é um evento útil na linha do tempo, evento sem data
 * não é.
 */
export function eventosDosCorreios(resposta: unknown): EventoRastreio[] {
  const raiz = (resposta || {}) as {
    objetos?: Array<{ eventos?: unknown[] }>;
  };
  const brutos = raiz.objetos?.[0]?.eventos || [];

  return brutos.flatMap((bruto) => {
    const e = (bruto || {}) as Record<string, unknown>;
    const quando = data(e.dtHrCriado ?? e.dtHrCriacao ?? e.data);
    const descricao = texto(e.descricao);
    if (!quando || !descricao) return [];

    const unidade = (e.unidade || {}) as Record<string, unknown>;
    const endereco = (unidade.endereco || {}) as Record<string, unknown>;

    return [
      {
        origem: 'correios' as const,
        codigo: texto(e.codigo) || 'evento',
        descricao,
        cidade: texto(endereco.cidade) || texto(unidade.nome) || null,
        uf: texto(endereco.uf).toUpperCase().slice(0, 2) || null,
        ocorridoEm: quando,
      },
    ];
  });
}

@Injectable()
export class ShipmentEventsService {
  private readonly logger = new Logger(ShipmentEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grava o que ainda não existe. A consulta e o webhook repetem os mesmos
   * eventos a cada rodada, então `skipDuplicates` com a chave única é o que
   * impede a linha do tempo de encher de repetição.
   */
  async registrar(orderId: string, eventos: EventoRastreio[]) {
    if (!eventos.length) return 0;
    try {
      const { count } = await this.prisma.shipmentEvent.createMany({
        data: eventos.map((e) => ({
          orderId,
          origem: e.origem,
          codigo: e.codigo,
          descricao: e.descricao,
          cidade: e.cidade ?? null,
          uf: e.uf ?? null,
          ocorridoEm: e.ocorridoEm,
        })),
        skipDuplicates: true,
      });
      return count;
    } catch (err) {
      /*
       * Rastreio é acessório: falhar aqui não pode derrubar a sincronização
       * nem o webhook, que têm trabalho mais importante a fazer.
       */
      this.logger.warn(
        `Falha ao gravar eventos do pedido ${orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 0;
    }
  }

  /** Linha do tempo pronta para a tela, do mais recente para o mais antigo. */
  async listar(orderId: string) {
    return this.prisma.shipmentEvent.findMany({
      where: { orderId },
      orderBy: { ocorridoEm: 'desc' },
      select: {
        descricao: true,
        cidade: true,
        uf: true,
        ocorridoEm: true,
        origem: true,
      },
    });
  }
}
