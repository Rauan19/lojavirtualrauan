import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { MailService } from '../mail/mail.service';
import { buildConviteEquipeEmail } from '../mail/convite-equipe-email';
import { PlanLimitsService } from '../plan-limits/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { AREAS, areaValida, type Area } from './areas';

/** O convite vale mais que a troca de senha (1 h): a pessoa pode ver depois. */
const VALIDADE_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;

const CAMPOS = {
  id: true,
  name: true,
  email: true,
  storeOwner: true,
  permissions: true,
  active: true,
  createdAt: true,
} as const;

type Linha = {
  id: string;
  name: string;
  email: string;
  storeOwner: boolean;
  permissions: string[];
  active: boolean;
  createdAt: Date;
};

/**
 * Equipe da loja: o dono convida pessoas e escolhe o que cada uma vê no
 * painel. Dinheiro (Mercado Pago, plano, taxas) e a própria equipe ficam só
 * com o dono; quem barra é o JwtAuthGuard, rota por rota (ver areas.ts).
 */
@Injectable()
export class EquipeService {
  private readonly logger = new Logger(EquipeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly limites: PlanLimitsService,
  ) {}

  async listar(storeId: string) {
    const [linhas, limites] = await Promise.all([
      this.prisma.user.findMany({
        where: { storeId, role: 'STORE_ADMIN' },
        select: CAMPOS,
        orderBy: [{ storeOwner: 'desc' }, { createdAt: 'asc' }],
      }),
      this.limites.forStore(storeId),
    ]);
    // Convite ainda aberto = a pessoa não criou a senha
    const pendentes = await this.prisma.passwordResetToken.findMany({
      where: {
        storeId,
        subject: 'STORE_ADMIN',
        usedAt: null,
        expiresAt: { gt: new Date() },
        email: { in: linhas.filter((l) => !l.storeOwner).map((l) => l.email) },
      },
      select: { email: true },
    });
    const comConvite = new Set(pendentes.map((p) => p.email));
    return {
      membros: linhas.map((l) => this.paraTela(l, comConvite.has(l.email))),
      limite: limites.maxUsers,
      emUso: linhas.filter((l) => l.active).length,
      areas: Object.entries(AREAS).map(([id, nome]) => ({ id, nome })),
    };
  }

  async convidar(
    storeId: string,
    quemConvida: string,
    dto: { name: string; email: string; permissoes: string[] },
  ) {
    const email = dto.email.trim().toLowerCase();
    const permissoes = this.validarPermissoes(dto.permissoes);

    // O login procura a conta só pelo e-mail: o mesmo e-mail em duas lojas
    // deixaria a pessoa sem saber em qual entrou
    const existente = await this.prisma.user.findFirst({
      where: { email, role: { in: ['STORE_ADMIN', 'SUPER_ADMIN'] } },
      select: { storeId: true },
    });
    if (existente) {
      throw new ConflictException(
        existente.storeId === storeId
          ? 'Essa pessoa já está na equipe.'
          : 'Este e-mail já tem acesso a outro painel. Peça um e-mail diferente para esta loja.',
      );
    }

    await this.limites.assertCanAddTeamMember(storeId);

    // Senha que ninguém sabe: a pessoa cria a dela pelo link do convite
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash,
        role: 'STORE_ADMIN',
        storeId,
        storeOwner: false,
        permissions: permissoes,
      },
      select: CAMPOS,
    });
    await this.enviarConvite(storeId, user, quemConvida);
    return this.paraTela(user, true);
  }

  async reenviarConvite(storeId: string, id: string, quemConvida: string) {
    const user = await this.funcionario(storeId, id);
    if (!user.active) {
      throw new BadRequestException('Reative a pessoa antes de reenviar.');
    }
    await this.enviarConvite(storeId, user, quemConvida);
    return { ok: true };
  }

  async atualizar(
    storeId: string,
    id: string,
    dto: { name?: string; permissoes?: string[]; ativo?: boolean },
  ) {
    const user = await this.funcionario(storeId, id);
    if (dto.ativo === true && !user.active) {
      await this.limites.assertCanAddTeamMember(storeId);
    }
    const desativando = dto.ativo === false && user.active;
    const atualizado = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.permissoes !== undefined
          ? { permissions: this.validarPermissoes(dto.permissoes) }
          : {}),
        ...(dto.ativo !== undefined ? { active: dto.ativo } : {}),
        // Desativar derruba a sessão aberta na hora
        ...(desativando ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: CAMPOS,
    });
    if (desativando) await this.queimarConvites(storeId, user.email);
    return this.paraTela(atualizado, false);
  }

  async remover(storeId: string, id: string) {
    const user = await this.funcionario(storeId, id);
    await this.queimarConvites(storeId, user.email);
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  /** Só funcionários: o dono não é editado nem removido por aqui. */
  private async funcionario(storeId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, storeId, role: 'STORE_ADMIN' },
      select: CAMPOS,
    });
    if (!user) throw new NotFoundException('Pessoa não encontrada na equipe.');
    if (user.storeOwner) {
      throw new BadRequestException(
        'O dono da loja tem acesso a tudo e não pode ser alterado aqui.',
      );
    }
    return user;
  }

  private validarPermissoes(lista: string[]): Area[] {
    const unicas = [...new Set(lista)];
    const invalida = unicas.find((a) => !areaValida(a));
    if (invalida) {
      throw new BadRequestException(`Área desconhecida: ${invalida}`);
    }
    if (unicas.length === 0) {
      throw new BadRequestException(
        'Escolha pelo menos uma área para a pessoa cuidar.',
      );
    }
    return unicas as Area[];
  }

  private async queimarConvites(storeId: string, email: string) {
    await this.prisma.passwordResetToken.updateMany({
      where: { storeId, email, subject: 'STORE_ADMIN', usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  private async enviarConvite(
    storeId: string,
    user: Linha,
    quemConvida: string,
  ) {
    await this.queimarConvites(storeId, user.email);
    const raw = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        subject: 'STORE_ADMIN',
        email: user.email,
        storeId,
        tokenHash: createHash('sha256').update(raw).digest('hex'),
        expiresAt: new Date(Date.now() + VALIDADE_CONVITE_MS),
      },
    });
    const loja = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });
    const front =
      this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
      'http://localhost:3000';
    const mail = buildConviteEquipeEmail({
      storeName: loja?.name || '',
      nome: user.name,
      quemConvidou: quemConvida,
      areas: user.permissions.filter(areaValida).map((a) => AREAS[a]),
      link: `${front}/redefinir-senha?token=${raw}&convite=1`,
    });
    void this.mail
      .send({
        to: user.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      })
      .catch((e: unknown) =>
        this.logger.warn(
          `Convite para a equipe não saiu: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
  }

  private paraTela(l: Linha, convitePendente: boolean) {
    return {
      id: l.id,
      nome: l.name,
      email: l.email,
      dono: l.storeOwner,
      permissoes: l.storeOwner ? Object.keys(AREAS) : l.permissions,
      ativo: l.active,
      convitePendente: !l.storeOwner && l.active && convitePendente,
      desde: l.createdAt,
    };
  }
}
