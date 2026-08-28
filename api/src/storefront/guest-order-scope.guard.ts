import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser } from '../common/decorators/current-user.decorator';

/**
 * Fecha o alcance do token de compra sem cadastro.
 *
 * Esse token nasce amarrado a um pedido (`orderId`). Aqui garantimos que ele
 * só sirva para aquele pedido: sem isso, bastaria comprar como convidado
 * usando o e-mail de outra pessoa para listar as compras dela.
 *
 * Sessão normal (sem `orderId` no token) passa direto.
 */
@Injectable()
export class GuestOrderScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();

    const guestOrderId = request.user?.orderId;
    if (!guestOrderId) return true;

    const params = (request.params || {}) as Record<string, string>;
    const target = params.id || params.orderId;

    if (!target) {
      throw new ForbiddenException(
        'Entre na sua conta para ver todas as suas compras.',
      );
    }
    if (target !== guestOrderId) {
      throw new ForbiddenException('Este acesso é de outro pedido.');
    }
    return true;
  }
}
