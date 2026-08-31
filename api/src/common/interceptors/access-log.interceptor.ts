import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { AccessLogService } from '../access-log.service';

/*
 * Alimenta o registro de acesso do art. 15 do Marco Civil.
 *
 * Roda antes do handler e não espera nada: gravar o registro não pode
 * atrasar nem derrubar a resposta ao cliente. A deduplicação por hora fica no
 * serviço.
 *
 * Requisição de leitura de asset e health check ficam de fora — não são "uso
 * da aplicação" no sentido da lei e só inflariam a tabela.
 */

const IGNORAR = [/^\/api\/health/, /^\/uploads\//, /^\/api\/public\/plans/];

type ReqComUsuario = Request & {
  /** Preenchido pelos guards de JWT — ver AuthUser. */
  user?: { id?: string; role?: string };
  store?: { id?: string };
};

@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  constructor(private readonly accessLog: AccessLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<ReqComUsuario>();
    const path = req.originalUrl || req.url || '';

    if (!IGNORAR.some((re) => re.test(path))) {
      // AuthUser expõe role; `typ` só existe dentro do payload do token
      const ehCliente = req.user?.role === 'CUSTOMER';
      void this.accessLog.registrar({
        storeId: req.store?.id ?? null,
        customerId: ehCliente ? (req.user?.id ?? null) : null,
        userId: !ehCliente ? (req.user?.id ?? null) : null,
        ip: ipDaRequisicao(req),
        userAgent: req.headers['user-agent'] ?? null,
        path: path.split('?')[0],
      });
    }

    return next.handle();
  }
}

/**
 * Atrás de proxy o IP real vem no X-Forwarded-For. Pega o primeiro da lista,
 * que é o cliente; os demais são os proxies do caminho.
 */
function ipDaRequisicao(req: Request) {
  const encaminhado = req.headers['x-forwarded-for'];
  const bruto = Array.isArray(encaminhado) ? encaminhado[0] : encaminhado;
  if (bruto) return bruto.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'desconhecido';
}
