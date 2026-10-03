import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

type ReqComUsuario = Request & {
  user?: { id?: string; email?: string; role?: string };
};

/*
 * "Quem fez o quê" no Super Admin: toda alteração (não-GET) feita por um
 * usuário SUPER_ADMIN, dono ou colaborador, vira uma linha em
 * PlatformAuditLog. Só método, rota e status: o corpo pode ter senha ou
 * token. Login e troca de senha (/auth) ficam de fora: não alteram a
 * plataforma.
 *
 * Grava depois da resposta e sem esperar: o registro não pode atrasar nem
 * derrubar a ação de quem está usando o painel.
 */
@Injectable()
export class AuditoriaPlataformaInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditoriaPlataformaInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<ReqComUsuario>();
    const metodo = (req.method || 'GET').toUpperCase();
    const caminho = (req.originalUrl || req.url || '').split('?')[0];
    const user = req.user;

    if (
      metodo === 'GET' ||
      metodo === 'HEAD' ||
      metodo === 'OPTIONS' ||
      user?.role !== Role.SUPER_ADMIN ||
      !user.id ||
      /^\/api\/auth(\/|$)/.test(caminho)
    ) {
      return next.handle();
    }

    const gravar = (status: number) => {
      void this.prisma.platformAuditLog
        .create({
          data: {
            userId: user.id ?? null,
            userEmail: user.email || '',
            method: metodo,
            path: caminho,
            status,
          },
        })
        .catch((e: unknown) =>
          this.logger.warn(
            `Não gravou a auditoria de ${metodo} ${caminho}: ${String(e)}`,
          ),
        );
    };

    return next.handle().pipe(
      tap({
        next: () =>
          gravar(context.switchToHttp().getResponse<Response>().statusCode),
        error: (e: unknown) =>
          gravar(e instanceof HttpException ? e.getStatus() : 500),
      }),
    );
  }
}
