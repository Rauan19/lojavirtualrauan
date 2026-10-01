import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { AuthUser } from '../decorators/current-user.decorator';
import { funcionarioPode } from '../../equipe/areas';

export const PERMITIR_SEM_2FA = 'permitirSemSegundoFator';

/**
 * Rota liberada para quem ainda precisa ativar a verificação em duas etapas
 * (Super Admin sem 2FA): "quem sou eu" e as telas de ativação. O resto do
 * painel fica fechado até a ativação.
 */
export const PermitirSemSegundoFator = () =>
  SetMetadata(PERMITIR_SEM_2FA, true);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  handleRequest<TUser>(
    err: Error | null,
    user: TUser,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Não autenticado');
    }
    // Funcionário da loja: só as áreas que o dono liberou
    const funcionario = (user as unknown as AuthUser).funcionario;
    if (funcionario) {
      const req = context
        .switchToHttp()
        .getRequest<{ method?: string; originalUrl?: string; url?: string }>();
      if (
        !funcionarioPode(
          funcionario.permissoes,
          req.method || 'GET',
          req.originalUrl || req.url || '/',
        )
      ) {
        throw new ForbiddenException(
          'Seu acesso não inclui esta parte do painel. Fale com o dono da loja.',
        );
      }
    }
    if ((user as unknown as AuthUser).mfaSetupOnly) {
      const liberada = this.reflector.getAllAndOverride<boolean>(
        PERMITIR_SEM_2FA,
        [context.getHandler(), context.getClass()],
      );
      if (!liberada) {
        throw new ForbiddenException(
          'Ative a verificação em duas etapas para continuar.',
        );
      }
    }
    return user;
  }
}

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(_err: Error | null, user: TUser): TUser | null {
    // Sessão só de ativação do 2FA não vale como login em rota opcional
    if (user && (user as unknown as AuthUser).mfaSetupOnly) return null;
    return user ?? null;
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
