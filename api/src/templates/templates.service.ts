import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StoreStatus, type Template } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACESSOS, liberacao, type AcessoTemplate } from './acesso';
import {
  normalizarReceita,
  RECEITA_BASE,
  type TemplateReceita,
} from './receita';
import { CriarTemplateDto, EditarTemplateDto } from './templates.dto';

/** Template de reserva: nunca some; recebe as lojas de um excluído */
export const TEMPLATE_RESERVA = 'essencial';

const SEGMENTOS_MAX = 6;

export type TemplatePublico = {
  chave: string;
  nome: string;
  paraQuem: string;
  descricao: string;
  segmentos: string[];
  receita: TemplateReceita;
};

function publico(t: Template): TemplatePublico {
  return {
    chave: t.chave,
    nome: t.nome,
    paraQuem: t.paraQuem,
    descricao: t.descricao,
    segmentos: t.segmentos,
    receita: normalizarReceita(t.receita),
  };
}

function regra(t: Template) {
  return {
    chave: t.chave,
    acesso: (ACESSOS as readonly string[]).includes(t.acesso)
      ? (t.acesso as AcessoTemplate)
      : 'gratis',
    planos: t.planos,
  };
}

function comoJson(receita: unknown) {
  return normalizarReceita(receita) as unknown as Prisma.InputJsonValue;
}

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** O que a loja já tem: plano, se está em teste e o que comprou */
  private async situacao(storeId: string) {
    const loja = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        planName: true,
        status: true,
        templateCompras: { select: { template: { select: { chave: true } } } },
      },
    });
    if (!loja) throw new NotFoundException('Loja não encontrada');
    return {
      planName: loja.planName,
      emTeste: loja.status === StoreStatus.TRIAL,
      compradas: new Set(loja.templateCompras.map((c) => c.template.chave)),
    };
  }

  /** Galeria do lojista: ativos, cada um dizendo se a loja pode usar */
  async galeriaDaLoja(storeId: string) {
    const [temas, situacao] = await Promise.all([
      this.prisma.template.findMany({
        where: { ativo: true },
        orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      }),
      this.situacao(storeId),
    ]);
    return temas.map((t) => ({
      ...publico(t),
      acesso: regra(t).acesso,
      planos: t.planos,
      precoCentavos: t.precoCentavos,
      liberacao: liberacao(regra(t), situacao),
    }));
  }

  /**
   * Template de uma loja (ou da prévia). Chave estranha ou excluída cai no
   * Essencial; se nem ele estiver no banco, usa a receita base.
   */
  async resolver(chave?: string | null): Promise<TemplatePublico> {
    const alvo = (chave || '').trim() || TEMPLATE_RESERVA;
    const t =
      (await this.prisma.template.findUnique({ where: { chave: alvo } })) ??
      (alvo !== TEMPLATE_RESERVA
        ? await this.prisma.template.findUnique({
            where: { chave: TEMPLATE_RESERVA },
          })
        : null);
    if (t) return publico(t);
    return {
      chave: TEMPLATE_RESERVA,
      nome: 'Essencial',
      paraQuem: '',
      descricao: '',
      segmentos: [],
      receita: { ...RECEITA_BASE },
    };
  }

  /** Antes de salvar a escolha do lojista: existe, está ativo e é dele */
  async garantirDisponivel(chave: string, storeId: string) {
    const t = await this.prisma.template.findUnique({ where: { chave } });
    if (!t || !t.ativo) {
      throw new BadRequestException('Este template não está disponível.');
    }
    const l = liberacao(regra(t), await this.situacao(storeId));
    if (!l.liberado) {
      throw new ForbiddenException(
        l.precisa === 'plano'
          ? 'Este template faz parte de um plano maior. Mude de plano para usar.'
          : 'Este template é vendido à parte.',
      );
    }
  }

  /** Super Admin: todos, com quantas lojas usam e quantas compraram */
  async listarTodos() {
    const [temas, uso] = await Promise.all([
      this.prisma.template.findMany({
        orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
        include: { _count: { select: { compras: true } } },
      }),
      this.prisma.store.groupBy({
        by: ['storeTheme'],
        _count: { _all: true },
      }),
    ]);
    const porChave = new Map<string, number>();
    for (const u of uso) {
      const k = u.storeTheme || TEMPLATE_RESERVA;
      porChave.set(k, (porChave.get(k) ?? 0) + u._count._all);
    }
    return temas.map((t) => ({
      ...publico(t),
      ativo: t.ativo,
      ordem: t.ordem,
      acesso: regra(t).acesso,
      planos: t.planos,
      precoCentavos: t.precoCentavos,
      lojas: porChave.get(t.chave) ?? 0,
      compras: t._count.compras,
    }));
  }

  private dados(dto: EditarTemplateDto) {
    return {
      ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
      ...(dto.paraQuem !== undefined ? { paraQuem: dto.paraQuem.trim() } : {}),
      ...(dto.descricao !== undefined
        ? { descricao: dto.descricao.trim() }
        : {}),
      ...(dto.segmentos !== undefined
        ? { segmentos: dto.segmentos.slice(0, SEGMENTOS_MAX) }
        : {}),
      ...(dto.receita !== undefined ? { receita: comoJson(dto.receita) } : {}),
      ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      ...(dto.ordem !== undefined ? { ordem: dto.ordem } : {}),
      ...(dto.acesso !== undefined ? { acesso: dto.acesso } : {}),
      ...(dto.planos !== undefined ? { planos: dto.planos } : {}),
      ...(dto.precoCentavos !== undefined
        ? { precoCentavos: dto.precoCentavos }
        : {}),
    };
  }

  async criar(dto: CriarTemplateDto) {
    try {
      const t = await this.prisma.template.create({
        data: {
          paraQuem: '',
          descricao: '',
          receita: comoJson(dto.receita ?? {}),
          ordem: 100,
          ...this.dados(dto),
          chave: dto.chave,
          nome: dto.nome.trim(),
          // Nasce desligado: o Super Admin confere a prévia antes de liberar
          ativo: dto.ativo ?? false,
        },
      });
      return publico(t);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Já existe um template com essa chave.');
      }
      throw e;
    }
  }

  async editar(chave: string, dto: EditarTemplateDto) {
    const atual = await this.prisma.template.findUnique({ where: { chave } });
    if (!atual) throw new NotFoundException('Template não encontrado');
    if (
      chave === TEMPLATE_RESERVA &&
      (dto.ativo === false || (dto.acesso && dto.acesso !== 'gratis'))
    ) {
      throw new BadRequestException(
        'O Essencial é o template de reserva: fica sempre ativo e grátis.',
      );
    }
    const t = await this.prisma.template.update({
      where: { chave },
      data: this.dados(dto),
    });
    return publico(t);
  }

  /** Exclui e devolve as lojas que usavam o template para o Essencial */
  async excluir(chave: string) {
    if (chave === TEMPLATE_RESERVA) {
      throw new BadRequestException(
        'O Essencial é o template de reserva e não pode ser excluído.',
      );
    }
    const atual = await this.prisma.template.findUnique({ where: { chave } });
    if (!atual) throw new NotFoundException('Template não encontrado');
    const [lojas] = await this.prisma.$transaction([
      this.prisma.store.updateMany({
        where: { storeTheme: chave },
        data: { storeTheme: null, storeFont: null, storeCardRatio: null },
      }),
      this.prisma.template.delete({ where: { chave } }),
    ]);
    return { ok: true, lojasMovidas: lojas.count };
  }

  /** Super Admin libera um template pago para uma loja, sem cobrar */
  async darCortesia(chave: string, storeId: string) {
    const t = await this.prisma.template.findUnique({ where: { chave } });
    if (!t) throw new NotFoundException('Template não encontrado');
    const loja = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!loja) throw new NotFoundException('Loja não encontrada');
    await this.prisma.templateCompra.upsert({
      where: { templateId_storeId: { templateId: t.id, storeId } },
      create: { templateId: t.id, storeId, origem: 'cortesia' },
      update: {},
    });
    return { ok: true };
  }
}
