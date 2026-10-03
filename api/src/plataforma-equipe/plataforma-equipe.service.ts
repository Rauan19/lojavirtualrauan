import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  AREAS_PLATAFORMA,
  areaPlataformaValida,
  type AreaPlataforma,
} from './areas';

const CAMPOS = {
  id: true,
  name: true,
  email: true,
  storeOwner: true,
  permissions: true,
  active: true,
  senhaProvisoria: true,
  totpEnabledAt: true,
  createdAt: true,
} as const;

/**
 * Equipe do Super Admin. O dono da plataforma (storeOwner = true) cria
 * colaboradores com senha provisória e escolhe as áreas de cada um; quem
 * barra cada rota é o JwtAuthGuard (ver areas.ts). Sem e-mail de convite:
 * o dono passa a senha provisória para a pessoa, que troca no 1º acesso.
 */
@Injectable()
export class PlataformaEquipeService {
  constructor(private readonly prisma: PrismaService) {}

  async listar() {
    const membros = await this.prisma.user.findMany({
      where: { role: Role.SUPER_ADMIN, storeId: null },
      select: CAMPOS,
      orderBy: [{ storeOwner: 'desc' }, { createdAt: 'asc' }],
    });
    return {
      membros: membros.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        dono: m.storeOwner,
        permissoes: m.storeOwner ? null : m.permissions,
        ativo: m.active,
        senhaProvisoria: m.senhaProvisoria,
        doisFatores: Boolean(m.totpEnabledAt),
        createdAt: m.createdAt,
      })),
      areas: Object.entries(AREAS_PLATAFORMA).map(([chave, descricao]) => ({
        chave,
        descricao,
      })),
    };
  }

  async criar(dto: {
    name: string;
    email: string;
    senhaProvisoria: string;
    permissoes: string[];
  }) {
    const email = dto.email.trim().toLowerCase();
    // O login escolhe a conta pelo e-mail e prefere a de Super Admin: um
    // e-mail repetido trocaria o painel de quem já usa esse endereço
    const existe = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (existe) {
      throw new ConflictException(
        'Este e-mail já é usado por outra conta (de loja ou da plataforma). Use outro.',
      );
    }
    const permissoes = this.areas(dto.permissoes);
    const criado = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        passwordHash: await bcrypt.hash(dto.senhaProvisoria, 10),
        role: Role.SUPER_ADMIN,
        storeId: null,
        storeOwner: false,
        permissions: permissoes,
        senhaProvisoria: true,
      },
      select: { id: true },
    });
    return { id: criado.id };
  }

  async atualizar(
    autorId: string,
    id: string,
    dto: {
      name?: string;
      permissoes?: string[];
      ativo?: boolean;
      senhaProvisoria?: string;
    },
  ) {
    await this.colaborador(autorId, id);
    const data: {
      name?: string;
      permissions?: AreaPlataforma[];
      active?: boolean;
      passwordHash?: string;
      senhaProvisoria?: boolean;
      tokenVersion?: { increment: number };
    } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.permissoes !== undefined)
      data.permissions = this.areas(dto.permissoes);
    if (dto.ativo !== undefined) data.active = dto.ativo;
    if (dto.senhaProvisoria) {
      // Nova senha provisória: derruba as sessões e pede troca no próximo acesso
      data.passwordHash = await bcrypt.hash(dto.senhaProvisoria, 10);
      data.senhaProvisoria = true;
    }
    if (dto.ativo === false || dto.senhaProvisoria) {
      data.tokenVersion = { increment: 1 };
    }
    await this.prisma.user.update({ where: { id }, data });
    return { ok: true };
  }

  async remover(autorId: string, id: string) {
    await this.colaborador(autorId, id);
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  async atividade(limite = 100) {
    return this.prisma.platformAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limite, 1), 300),
      select: {
        id: true,
        userEmail: true,
        method: true,
        path: true,
        status: true,
        createdAt: true,
      },
    });
  }

  /** Só colaborador se edita: o dono (e a própria conta) ficam de fora. */
  private async colaborador(autorId: string, id: string) {
    if (id === autorId) {
      throw new BadRequestException(
        'Você não pode alterar a própria conta aqui.',
      );
    }
    const u = await this.prisma.user.findFirst({
      where: { id, role: Role.SUPER_ADMIN, storeId: null },
      select: { storeOwner: true },
    });
    if (!u) throw new NotFoundException('Colaborador não encontrado.');
    if (u.storeOwner) {
      throw new BadRequestException(
        'O dono da plataforma não pode ser alterado nem removido.',
      );
    }
  }

  private areas(lista: string[]): AreaPlataforma[] {
    const unicas = [...new Set(lista)];
    const invalida = unicas.find((a) => !areaPlataformaValida(a));
    if (invalida) {
      throw new BadRequestException(`Área desconhecida: ${invalida}`);
    }
    if (unicas.length === 0) {
      throw new BadRequestException('Escolha pelo menos uma área.');
    }
    return unicas as AreaPlataforma[];
  }
}
