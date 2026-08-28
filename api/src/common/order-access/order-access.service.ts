import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';

/** Válido durante o checkout: pagar e ver o pedido recém-criado. */
export const GUEST_CHECKOUT_TTL = '4h';

/**
 * Vai no link do e-mail. Precisa durar o suficiente para o cliente
 * acompanhar entrega e eventual troca sem precisar criar conta.
 */
export const GUEST_TRACKING_TTL = '90d';

export type OrderAccessSubject = {
  id: string;
  email: string;
  storeId: string;
  tokenVersion: number;
};

/**
 * Emite o token de acesso a UM pedido, usado por quem comprou sem cadastro.
 *
 * Fica separado do login normal de propósito: esse token nunca dá acesso à
 * conta, só ao pedido do claim `oid` (ver GuestOrderScopeGuard).
 */
@Injectable()
export class OrderAccessService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  sign(
    customer: OrderAccessSubject,
    orderId: string,
    expiresIn: string = GUEST_CHECKOUT_TTL,
  ): Promise<string> {
    return this.jwt.signAsync(
      {
        sub: customer.id,
        email: customer.email,
        role: Role.CUSTOMER,
        storeId: customer.storeId,
        typ: 'guest',
        tv: customer.tokenVersion,
        oid: orderId,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: expiresIn as `${number}d`,
      },
    );
  }
}
