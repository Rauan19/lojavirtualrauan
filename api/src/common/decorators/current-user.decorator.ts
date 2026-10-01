import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  storeId: string | null;
  /**
   * Só em token de convidado (compra sem cadastro): limita o acesso a este
   * único pedido. Sem isso, saber o e-mail de alguém daria a lista inteira
   * de compras dessa pessoa.
   */
  orderId?: string;
  /**
   * Super Admin que ainda não ativou a verificação em duas etapas: a sessão
   * só abre as telas de ativação (ver PermitirSemSegundoFator).
   */
  mfaSetupOnly?: boolean;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthUser }>();
    return request.user;
  },
);
