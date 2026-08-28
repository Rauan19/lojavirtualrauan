import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
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

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
      tv: user.tokenVersion,
    };

    return {
      accessToken: await this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ||
          '7d') as `${number}d`,
      }),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
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

      await this.mail.send({
        to: email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
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
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { ok: true, message: 'Senha atualizada. Você já pode entrar.' };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { store: true },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
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
