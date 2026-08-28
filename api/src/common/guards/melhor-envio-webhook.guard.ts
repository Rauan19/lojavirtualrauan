import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { safeEqual } from '../utils/safe-equal';

/**
 * Protege webhook Melhor Envio.
 * Aceita ME_WEBHOOK_SECRET em: header x-me-signature, x-webhook-secret ou ?secret=
 * Em produção o segredo é obrigatório.
 */
@Injectable()
export class MelhorEnvioWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const secret = this.config.get<string>('ME_WEBHOOK_SECRET')?.trim();

    if (!secret) {
      if (isProd) {
        throw new UnauthorizedException(
          'ME_WEBHOOK_SECRET obrigatório em produção',
        );
      }
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const fromQuery =
      typeof req.query?.secret === 'string' ? req.query.secret : '';
    const fromHeader =
      String(req.headers['x-me-signature'] || '') ||
      String(req.headers['x-webhook-secret'] || '');
    const provided = fromQuery || fromHeader;

    if (!provided || !safeEqual(provided, secret)) {
      throw new UnauthorizedException('Webhook Melhor Envio não autorizado');
    }
    return true;
  }
}
