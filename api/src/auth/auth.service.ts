import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DoisFatoresService } from './dois-fatores.service';
import { MailService } from '../mail/mail.service';
import { comparePasswordConstantTime } from '../common/utils/password-timing';
import { buildPasswordResetEmail } from '../mail/password-reset-email';
import {
  AdminForgotPasswordDto,
  AdminResetPasswordDto,
  LoginDto,
} from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly doisFatores: DoisFatoresService,
  ) {}

  async login(dto: LoginDto) {
    // E-mail pode repetir entre lojas; prioriza super admin, depois admin com loja
    const candidates = await this.prisma.user.findMany({
      where: { email: dto.email.toLowerCase(), active: true },
      include: { store: true },
      orderBy: { createdAt: 'asc' },
    });

    const user =
      candidates.find((u) => u.role === 'SUPER_ADMIN') ||
      candidates.find((u) => u.role === 'STORE_ADMIN' && u.storeId) ||
      candidates[0];

    const ok = await comparePasswordConstantTime(
      dto.password,
      user?.passwordHash,
    );
    if (!user || !ok) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Senha certa com 2FA ativo: ainda não é login, só um passe de 5 minutos
    // que serve apenas para mandar o código do app
    if (user.totpEnabledAt) {
      return {
        segundaEtapa: true as const,
        desafio: await this.jwt.signAsync(
          { sub: user.id, tv: user.tokenVersion, typ: 'mfa' },
          {
            secret: this.config.getOrThrow<string>('JWT_SECRET'),
            expiresIn: '5m',
          },
        ),
      };
    }

    // Conta obrigada a ter 2FA e ainda sem: sessão curta que só abre a ativação
    const soAtivacao = this.doisFatores.exigido(user.role);
    return this.sessao(user, soAtivacao);
  }

  /** Segunda etapa do login: o passe da senha + o código do app (ou de recuperação). */
  async loginSegundaEtapa(desafio: string, codigo: string) {
    let payload: { sub?: string; tv?: number; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(desafio, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(
        'O tempo para digitar o código acabou. Entre com a senha de novo.',
      );
    }
    if (payload.typ !== 'mfa' || !payload.sub) {
      throw new UnauthorizedException('Entre com a senha de novo.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { store: true },
    });
    if (!user || !user.active || user.tokenVersion !== (payload.tv ?? 0)) {
      throw new UnauthorizedException('Entre com a senha de novo.');
    }
    const r = await this.doisFatores.conferirNoLogin(user.id, codigo);
    return {
      ...(await this.sessao(user, false)),
      ...(r.usouRecuperacao
        ? { codigosRecuperacaoRestantes: r.restantes }
        : {}),
    };
  }

  /** Sessão nova (depois de ativar o 2FA a versão do token muda). */
  async sessaoDoUsuario(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { store: true },
    });
    return this.sessao(user, false);
  }

  private async sessao(
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      storeId: string | null;
      tokenVersion: number;
      storeOwner?: boolean;
      permissions?: string[];
      store: { id: string; name: string; slug: string; status: string } | null;
    },
    soAtivacao: boolean,
  ) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
      tv: user.tokenVersion,
      ...(soAtivacao ? { ms: 1 } : {}),
    };

    return {
      accessToken: await this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: soAtivacao
          ? '30m'
          : ((this.config.get<string>('JWT_EXPIRES_IN') ||
              '7d') as `${number}d`),
      }),
      ...(soAtivacao ? { ativarDoisFatores: true as const } : {}),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
        ...this.equipe(user),
        store: user.store
          ? {
              id: user.store.id,
              name: user.store.name,
              slug: user.store.slug,
              status: user.store.status,
            }
          : null,
      },
    };
  }

  async forgotPassword(dto: AdminForgotPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const candidates = await this.prisma.user.findMany({
      where: { email, active: true },
      include: { store: true },
      orderBy: { createdAt: 'asc' },
    });
    const user =
      candidates.find((u) => u.role === 'SUPER_ADMIN') ||
      candidates.find((u) => u.role === 'STORE_ADMIN') ||
      candidates[0];

    if (user) {
      const raw = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(raw).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await this.prisma.passwordResetToken.create({
        data: {
          subject: user.role,
          email,
          storeId: user.storeId,
          tokenHash,
          expiresAt,
        },
      });

      const front =
        this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
        'http://localhost:3000';
      const link = `${front}/redefinir-senha?token=${raw}`;
      const mail = buildPasswordResetEmail({
        storeName: 'Painel da loja',
        resetUrl: link,
        audience: 'admin',
      });

      // Sem await: esperar o SMTP fazia a resposta demorar só quando a conta
      // existe, e o tempo entregava o que a mensagem genérica esconde.
      void this.mail
        .send({
          to: email,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        })
        .catch(() => undefined);
    }

    return {
      ok: true,
      message:
        'Se existir conta com este e-mail, enviamos instruções para redefinir a senha.',
    };
  }

  async resetPassword(dto: AdminResetPasswordDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (
      !row ||
      (row.subject !== 'STORE_ADMIN' && row.subject !== 'SUPER_ADMIN') ||
      row.usedAt ||
      row.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Link inválido ou expirado');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        email: row.email,
        role: row.subject,
        ...(row.storeId ? { storeId: row.storeId } : {}),
        active: true,
      },
    });
    if (!user) {
      throw new BadRequestException('Link inválido ou expirado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.$transaction([
      // tokenVersion++ derruba qualquer sessão aberta com a senha antiga
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          senhaProvisoria: false,
          tokenVersion: { increment: 1 },
        },
      }),
      // Queima este link e qualquer outro pedido de troca ainda aberto
      this.prisma.passwordResetToken.updateMany({
        where: {
          email: row.email,
          subject: row.subject,
          storeId: row.storeId,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      }),
    ]);

    return { ok: true, message: 'Senha atualizada. Você já pode entrar.' };
  }

  /** Dono vê tudo; funcionário, só as áreas que o dono liberou. */
  private equipe(user: {
    role: Role;
    storeOwner?: boolean;
    permissions?: string[];
  }) {
    if (user.role !== 'STORE_ADMIN' && user.role !== 'SUPER_ADMIN') return {};
    const dono = user.storeOwner !== false;
    return { dono, permissoes: dono ? null : (user.permissions ?? []) };
  }

  /**
   * Troca de senha com a sessão aberta (sem e-mail): obrigatória para quem
   * entrou com senha provisória, e disponível para qualquer usuário do painel.
   * Devolve uma sessão nova, porque a troca derruba as antigas.
   */
  async trocarSenha(userId: string, atual: string, nova: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { store: true },
    });
    const ok = await comparePasswordConstantTime(atual, user?.passwordHash);
    if (!user || !ok) {
      throw new BadRequestException('A senha atual não confere.');
    }
    if (atual === nova) {
      throw new BadRequestException(
        'A senha nova precisa ser diferente da atual.',
      );
    }
    const atualizado = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(nova, 10),
        senhaProvisoria: false,
        // Derruba qualquer outra sessão aberta com a senha antiga
        tokenVersion: { increment: 1 },
      },
      include: { store: true },
    });
    const soAtivacao =
      this.doisFatores.exigido(atualizado.role) && !atualizado.totpEnabledAt;
    return this.sessao(atualizado, soAtivacao);
  }

  async me(userId: string, soAtivacao = false) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { store: true },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      doisFatores: {
        ativo: Boolean(user.totpEnabledAt),
        obrigatorio: this.doisFatores.exigido(user.role),
      },
      ...(soAtivacao ? { ativarDoisFatores: true } : {}),
      ...(user.senhaProvisoria ? { trocarSenha: true } : {}),
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
      ...this.equipe(user),
      // Nunca devolver a linha crua da loja aqui: tem token de gateway
      // (cifrado, mas mesmo assim não pertence a uma resposta de "quem sou
      // eu"), documento do lojista, endereço etc. Só o que a UI precisa.
      store: user.store
        ? {
            id: user.store.id,
            name: user.store.name,
            slug: user.store.slug,
            status: user.store.status,
          }
        : null,
    };
  }
}
