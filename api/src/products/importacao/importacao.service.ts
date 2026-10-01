import { BadRequestException, Injectable } from '@nestjs/common';
import { PlanLimitsService } from '../../plan-limits/plan-limits.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from '../products.service';
import {
  decodificar,
  lerCsv,
  lerProdutos,
  type LinhaLida,
  type ProdutoDaPlanilha,
} from './planilha';

type Acao = 'criar' | 'atualizar' | 'erro';

type LinhaPrevia = {
  linha: number;
  nome: string;
  codigo: string | null;
  acao: Acao;
  erros: string[];
};

/** Categoria padrão para linha sem categoria. */
const CATEGORIA_PADRAO = 'Geral';

/**
 * Importação de produtos por planilha.
 *
 * Primeiro a prévia (nada é gravado): quantos produtos novos, quantos serão
 * atualizados (mesmo código) e o erro de cada linha. Depois a confirmação,
 * que grava pelo mesmo caminho do cadastro do painel — mesmas validações,
 * código do produto e limite do plano.
 */
@Injectable()
export class ImportacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  private ler(arquivo: Buffer | undefined) {
    if (!arquivo?.length) throw new BadRequestException('Envie a planilha.');
    try {
      return lerProdutos(lerCsv(decodificar(arquivo)));
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Não foi possível ler a planilha.',
      );
    }
  }

  /** Códigos da planilha que já existem na loja → id do produto. */
  private async existentes(storeId: string, linhas: LinhaLida[]) {
    const codigos = [
      ...new Set(
        linhas
          .map((l) => l.produto?.codigo?.trim().toUpperCase())
          .filter((c): c is string => Boolean(c)),
      ),
    ];
    if (!codigos.length) return new Map<string, string>();
    const rows = await this.prisma.product.findMany({
      where: { storeId, sku: { in: codigos, mode: 'insensitive' } },
      select: { id: true, sku: true },
    });
    return new Map(rows.map((r) => [(r.sku || '').toUpperCase(), r.id]));
  }

  async previa(storeId: string, arquivo: Buffer | undefined) {
    const { linhas, colunasIgnoradas } = this.ler(arquivo);
    const existe = await this.existentes(storeId, linhas);

    // Código repetido dentro da própria planilha
    const vistos = new Map<string, number>();
    const resultado: LinhaPrevia[] = linhas.map((l) => {
      const codigo = l.produto?.codigo?.trim().toUpperCase() || null;
      const erros = [...l.erros];
      if (codigo) {
        const antes = vistos.get(codigo);
        if (antes) erros.push(`código repetido (também na linha ${antes})`);
        else vistos.set(codigo, l.linha);
      }
      return {
        linha: l.linha,
        nome: l.produto?.nome ?? '',
        codigo,
        acao: erros.length
          ? 'erro'
          : codigo && existe.has(codigo)
            ? 'atualizar'
            : 'criar',
        erros,
      };
    });

    const limites = await this.planLimits.forStore(storeId);
    const atuais = await this.prisma.product.count({ where: { storeId } });
    const novos = resultado.filter((r) => r.acao === 'criar').length;
    const vagas =
      limites.maxProducts == null
        ? null
        : Math.max(0, limites.maxProducts - atuais);

    return {
      resumo: {
        criar: novos,
        atualizar: resultado.filter((r) => r.acao === 'atualizar').length,
        erros: resultado.filter((r) => r.acao === 'erro').length,
      },
      limite:
        vagas == null
          ? null
          : {
              plano: limites.planName,
              maximo: limites.maxProducts,
              vagas,
              passa: novos > vagas,
            },
      colunasIgnoradas,
      linhas: resultado,
    };
  }

  async importar(storeId: string, arquivo: Buffer | undefined) {
    const previa = await this.previa(storeId, arquivo);
    if (previa.limite?.passa) {
      throw new BadRequestException(
        `O plano ${previa.limite.plano} permite ${previa.limite.maximo} produtos e sobram ${previa.limite.vagas}. A planilha tem ${previa.resumo.criar} produtos novos.`,
      );
    }
    const { linhas } = this.ler(arquivo);
    const porLinha = new Map(linhas.map((l) => [l.linha, l]));
    const existe = await this.existentes(storeId, linhas);
    const categorias = new Map<string, string>();

    const resultado: {
      linha: number;
      nome: string;
      acao: Acao;
      erro?: string;
    }[] = [];
    for (const r of previa.linhas) {
      const p = porLinha.get(r.linha)?.produto;
      if (r.acao === 'erro' || !p) {
        resultado.push({
          linha: r.linha,
          nome: r.nome,
          acao: 'erro',
          erro: r.erros.join('; '),
        });
        continue;
      }
      try {
        const categoryId = await this.categoria(
          storeId,
          p.categoria,
          categorias,
        );
        const dados = this.paraDto(p, categoryId);
        const id = r.codigo ? existe.get(r.codigo) : undefined;
        if (id) {
          await this.products.updateProduct(storeId, id, dados);
        } else {
          await this.products.createProduct(storeId, {
            ...dados,
            imageUrls: p.fotos,
          });
        }
        resultado.push({
          linha: r.linha,
          nome: p.nome,
          acao: id ? 'atualizar' : 'criar',
        });
      } catch (e) {
        resultado.push({
          linha: r.linha,
          nome: p.nome,
          acao: 'erro',
          erro: e instanceof Error ? e.message : 'erro ao gravar',
        });
      }
    }

    return {
      criados: resultado.filter((r) => r.acao === 'criar').length,
      atualizados: resultado.filter((r) => r.acao === 'atualizar').length,
      erros: resultado.filter((r) => r.acao === 'erro'),
    };
  }

  private paraDto(p: ProdutoDaPlanilha, categoryId: string) {
    return {
      name: p.nome,
      price: p.preco,
      categoryId,
      ...(p.precoDe !== undefined ? { compareAt: p.precoDe } : {}),
      ...(p.estoque !== undefined ? { stock: p.estoque } : {}),
      ...(p.codigo ? { sku: p.codigo } : {}),
      ...(p.descricao ? { description: p.descricao } : {}),
      ...(p.marca ? { brand: p.marca } : {}),
      ...(p.pesoKg !== undefined ? { weightKg: p.pesoKg } : {}),
      ...(p.larguraCm !== undefined ? { widthCm: p.larguraCm } : {}),
      ...(p.alturaCm !== undefined ? { heightCm: p.alturaCm } : {}),
      ...(p.comprimentoCm !== undefined ? { lengthCm: p.comprimentoCm } : {}),
      ...(p.ativo !== undefined ? { active: p.ativo } : {}),
    };
  }

  /** Acha a categoria pelo nome (sem diferenciar maiúscula) ou cria. */
  private async categoria(
    storeId: string,
    nome: string | undefined,
    cache: Map<string, string>,
  ) {
    const alvo = (nome || CATEGORIA_PADRAO).trim();
    const chave = alvo.toLowerCase();
    const emCache = cache.get(chave);
    if (emCache) return emCache;
    const achada = await this.prisma.category.findFirst({
      where: { storeId, name: { equals: alvo, mode: 'insensitive' } },
      select: { id: true },
    });
    const id = achada
      ? achada.id
      : (await this.products.createCategory(storeId, { name: alvo })).id;
    cache.set(chave, id);
    return id;
  }
}
