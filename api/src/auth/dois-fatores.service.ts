import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as QRCode from 'qrcode';
import { SecretsService } from '../common/secrets/secrets.service';
import { comparePasswordConstantTime } from '../common/utils/password-timing';
import { PrismaService } from '../prisma/prisma.service';
import {
  enderecoOtpauth,
  gerarCodigosRecuperacao,
  gerarSegredo,
  hashRecuperacao,
  verificarCodigo,
} from './totp';

/** Erros seguidos até bloquear o código por um tempo. */
const LIMITE_ERROS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;

type UsuarioDoisFatores = {
  id: string;
  role: Role;
  totpSecret: string | null;
  totpEnabledAt: Date | null;
  totpLastStep: number | null;
  totpRecoveryHashes: string[];
  totpFailures: number;
  totpLockedUntil: Date | null;
};

/**
 * Verificação em duas etapas (TOTP) de quem entra no painel.
 *
 * - Super Admin: obrigatória (MFA_SUPER_ADMIN_OBRIGATORIO, padrão "true").
 *   Sem ela configurada, o login só libera a tela de ativação.
 * - Lojista: opcional, ativa em Configurações → Segurança.
 *
 * A chave fica cifrada no banco (mesma chave dos tokens das lojas) e os
 * códigos de recuperação só como hash.
 */
@Injectable()
export class DoisFatoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly config: ConfigService,
  ) {}

  /** Esta conta é obrigada a ter a verificação em duas etapas? */
  exigido(role: string): boolean {
    if (role !== Role.SUPER_ADMIN) return false;
    return this.config.get<string>('MFA_SUPER_ADMIN_OBRIGATORIO') !== 'false';
  }

  private emissor() {
    return this.config.get<string>('PLATFORM_BRAND_NAME')?.trim() || 'Vendira';
  }

  async status(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true, totpEnabledAt: true, totpRecoveryHashes: true },
    });
    return {
      ativo: Boolean(u.totpEnabledAt),
      obrigatorio: this.exigido(u.role),
      ativadoEm: u.totpEnabledAt,
      codigosRecuperacaoRestantes: u.totpRecoveryHashes.length,
    };
  }

  /** Gera a chave e o QR code. Só vale depois de confirmar com um código. */
  async iniciarAtivacao(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, totpEnabledAt: true },
    });
    if (u.totpEnabledAt) {
      throw new BadRequestException(
        'A verificação em duas etapas já está ativa.',
      );
    }
    const segredo = gerarSegredo();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpPendingSecret: this.secrets.encrypt(segredo) },
    });
    const url = enderecoOtpauth(this.emissor(), u.email, segredo);
    return {
      qrCode: await QRCode.toDataURL(url, { margin: 1, width: 240 }),
      // Para digitar no app quando a câmera não lê o QR
      chave: segredo.replace(/(.{4})/g, '$1 ').trim(),
    };
  }

  /**
   * Confirma a ativação com o primeiro código do app. Devolve os códigos de
   * recuperação — a única vez que eles aparecem em texto.
   */
  async confirmarAtivacao(userId: string, codigo: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpPendingSecret: true, totpEnabledAt: true },
    });
    if (u.totpEnabledAt) {
      throw new BadRequestException(
        'A verificação em duas etapas já está ativa.',
      );
    }
    const segredo = this.secrets.decryptSafe(u.totpPendingSecret);
    if (!segredo) {
      throw new BadRequestException('Comece a ativação de novo.');
    }
    const passo = verificarCodigo(segredo, codigo, null);
    if (passo == null) {
      throw new BadRequestException(
        'Código incorreto. Confira se o horário do celular está automático e tente o código que está aparecendo agora.',
      );
    }
    const codigos = gerarCodigosRecuperacao();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: this.secrets.encrypt(segredo),
        totpPendingSecret: null,
        totpEnabledAt: new Date(),
        totpLastStep: passo,
        totpRecoveryHashes: codigos.map(hashRecuperacao),
        totpFailures: 0,
        totpLockedUntil: null,
        // Sessões abertas antes da ativação deixam de valer
        tokenVersion: { increment: 1 },
      },
    });
    return { codigosRecuperacao: codigos };
  }

  /**
   * Confere o código do app (ou um código de recuperação) no login. Lança
   * se estiver errado; conta os erros e bloqueia depois do limite.
   */
  async conferirNoLogin(
    userId: string,
    codigo: string,
  ): Promise<{ usouRecuperacao: boolean; restantes: number }> {
    const u = await this.carregar(userId);
    if (!u.totpEnabledAt || !u.totpSecret) {
      throw new UnauthorizedException('Verificação em duas etapas não ativa.');
    }
    this.checarBloqueio(u);

    const digitado = codigo.trim();
    if (/^\d{6}$/.test(digitado.replace(/\s+/g, ''))) {
      const segredo = this.secrets.decryptSafe(u.totpSecret);
      const passo = segredo
        ? verificarCodigo(segredo, digitado, u.totpLastStep)
        : null;
      if (passo != null) {
        // updateMany com o passo antigo: dois logins com o mesmo código ao
        // mesmo tempo, só um passa
        const r = await this.prisma.user.updateMany({
          where: { id: userId, totpLastStep: u.totpLastStep },
          data: { totpLastStep: passo, totpFailures: 0, totpLockedUntil: null },
        });
        if (r.count === 1) {
          return {
            usouRecuperacao: false,
            restantes: u.totpRecoveryHashes.length,
          };
        }
      }
    } else {
      const hash = hashRecuperacao(digitado);
      if (u.totpRecoveryHashes.includes(hash)) {
        const restantes = u.totpRecoveryHashes.filter((h) => h !== hash);
        const r = await this.prisma.user.updateMany({
          where: { id: userId, totpRecoveryHashes: { has: hash } },
          data: {
            totpRecoveryHashes: restantes,
            totpFailures: 0,
            totpLockedUntil: null,
          },
        });
        if (r.count === 1) {
          return { usouRecuperacao: true, restantes: restantes.length };
        }
      }
    }

    await this.registrarErro(u);
    throw new UnauthorizedException('Código incorreto.');
  }

  /** Lojista desliga (Super Admin obrigatório não pode). Exige senha + código. */
  async desativar(userId: string, senha: string, codigo: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true, passwordHash: true, totpEnabledAt: true },
    });
    if (this.exigido(u.role)) {
      throw new ForbiddenException(
        'Para o Super Admin a verificação em duas etapas é obrigatória.',
      );
    }
    if (!u.totpEnabledAt) return { ativo: false };
    const senhaOk = await comparePasswordConstantTime(senha, u.passwordHash);
    if (!senhaOk) throw new UnauthorizedException('Senha incorreta.');
    await this.conferirNoLogin(userId, codigo);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: null,
        totpPendingSecret: null,
        totpEnabledAt: null,
        totpLastStep: null,
        totpRecoveryHashes: [],
        totpFailures: 0,
        totpLockedUntil: null,
      },
    });
    return { ativo: false };
  }

  /** Novos códigos de recuperação (os antigos deixam de valer). */
  async novosCodigosRecuperacao(userId: string, codigo: string) {
    await this.conferirNoLogin(userId, codigo);
    const codigos = gerarCodigosRecuperacao();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpRecoveryHashes: codigos.map(hashRecuperacao) },
    });
    return { codigosRecuperacao: codigos };
  }

  private carregar(userId: string): Promise<UsuarioDoisFatores> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        totpSecret: true,
        totpEnabledAt: true,
        totpLastStep: true,
        totpRecoveryHashes: true,
        totpFailures: true,
        totpLockedUntil: true,
      },
    });
  }

  private checarBloqueio(u: UsuarioDoisFatores) {
    if (u.totpLockedUntil && u.totpLockedUntil.getTime() > Date.now()) {
      const min = Math.ceil((u.totpLockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(
        `Muitas tentativas erradas. Tente de novo em ${min} minuto${min === 1 ? '' : 's'}.`,
      );
    }
  }

  private async registrarErro(u: UsuarioDoisFatores) {
    const erros = u.totpFailures + 1;
    await this.prisma.user.update({
      where: { id: u.id },
      data:
        erros >= LIMITE_ERROS
          ? {
              totpFailures: 0,
              totpLockedUntil: new Date(Date.now() + BLOQUEIO_MS),
            }
          : { totpFailures: erros },
    });
  }
}
