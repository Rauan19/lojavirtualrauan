import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../decorators/current-user.decorator';
import { TenantStore } from '../decorators/current-store.decorator';
import { ALLOW_PAST_DUE_KEY } from '../decorators/allow-past-due.decorator';
import { Role, StoreStatus } from '@prisma/client';
import { normalizeCustomDomain } from '../utils/normalize-domain';

/** Métodos que não alteram nada — liberados mesmo com mensalidade em atraso. */
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      hostname?: string;
      method?: string;
      user?: AuthUser;
      store?: TenantStore;
    }>();

    const slugHeader = request.headers['x-store-slug'];
    const rawHost = request.headers['x-forwarded-host'] || request.hostname;
    const host = normalizeCustomDomain(rawHost) || rawHost;

    // Admin da loja: resolve sempre pela loja do token (mais confiável que host/localhost)
    let store =
      (request.user?.storeId
        ? await this.prisma.store.findUnique({
            where: { id: request.user.storeId },
          })
        : null) ??
      (slugHeader
        ? await this.prisma.store.findUnique({ where: { slug: slugHeader } })
        : null);

    // Domínio customizado (não usar hostname "localhost" como slug)
    if (
      !store &&
      host &&
      host !== 'localhost' &&
      !String(host).startsWith('127.')
    ) {
      const domain = normalizeCustomDomain(host) || host;
      store = await this.prisma.store.findFirst({
        where: {
          OR: [
            { customDomain: domain },
            { customDomain: `www.${domain}` },
            { slug: String(host).split('.')[0] },
          ],
        },
      });
    }

    if (!store) {
      throw new NotFoundException('Loja não encontrada');
    }

    const isSuperAdmin = request.user?.role === Role.SUPER_ADMIN;

    if (store.status === StoreStatus.SUSPENDED && !isSuperAdmin) {
      throw new ForbiddenException('Loja suspensa');
    }

    if (
      request.user?.role === Role.STORE_ADMIN &&
      request.user.storeId !== store.id
    ) {
      throw new ForbiddenException('Acesso negado a esta loja');
    }

    // Mensalidade vencida mas ninguém marcou ainda (job pode ter falhado):
    // trata como atrasada aqui para o bloqueio não depender do agendador.
    const overdue =
      (store.status === StoreStatus.ACTIVE ||
        store.status === StoreStatus.TRIAL) &&
      store.planDueAt != null &&
      store.planDueAt.getTime() <= Date.now();

    if (
      (store.status === StoreStatus.PAST_DUE || overdue) &&
      request.user?.role === Role.STORE_ADMIN
    ) {
      const allowPastDue = this.reflector.getAllAndOverride<boolean>(
        ALLOW_PAST_DUE_KEY,
        [context.getHandler(), context.getClass()],
      );
      const readOnly = READ_ONLY_METHODS.has(
        (request.method || 'GET').toUpperCase(),
      );

      // Painel vira somente leitura até regularizar. A vitrine continua
      // vendendo — só SUSPENDED derruba a loja inteira.
      if (!allowPastDue && !readOnly) {
        throw new ForbiddenException(
          'Mensalidade em atraso. Regularize o pagamento em Configurações → Planos para voltar a editar a loja.',
        );
      }
    }

    request.store = {
      id: store.id,
      slug: store.slug,
      name: store.name,
      status: store.status,
      logoUrl: store.logoUrl,
      primaryColor: store.primaryColor,
      secondaryColor: store.secondaryColor,
      accentColor: store.accentColor,
      customDomain: store.customDomain,
    };

    return true;
  }
}
