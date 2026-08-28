import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  storeId: string | null;
  /** tokenVersion de quem assinou. Ausente = token emitido antes da revogação existir. */
  tv?: number;
  /** Token de convidado: restrito a este pedido. */
  oid?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Confere a conta no banco a cada request.
   *
   * Antes o payload era aceito de olhos fechados: trocar a senha, desativar
   * o usuário ou suspender a loja não derrubava sessão nenhuma — o token
   * continuava valendo por até 7 dias.
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const tokenVersion = payload.tv ?? 0;

    if (payload.role === Role.CUSTOMER) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          storeId: true,
          tokenVersion: true,
        },
      });
      if (!customer || customer.tokenVersion !== tokenVersion) {
        throw new UnauthorizedException('Sessão expirada. Entre de novo.');
      }
      return {
        id: customer.id,
        email: customer.email,
        role: Role.CUSTOMER,
        storeId: customer.storeId,
        ...(payload.oid ? { orderId: payload.oid } : {}),
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        storeId: true,
        active: true,
        tokenVersion: true,
      },
    });
    if (!user || !user.active || user.tokenVersion !== tokenVersion) {
      throw new UnauthorizedException('Sessão expirada. Entre de novo.');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
    };
  }
}
