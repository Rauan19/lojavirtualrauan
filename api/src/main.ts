import './instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { buildMercadoPagoWebhookUrl } from './common/utils/mercadopago-webhook-url';
import { normalizeCustomDomain } from './common/utils/normalize-domain';

function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw || raw.trim() === '' || raw.trim() === '*') {
    return [];
  }
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  const config = app.get(ConfigService);
  const isProd = config.get<string>('NODE_ENV') === 'production';
  const staticOrigins = parseCorsOrigins(config.get<string>('CORS_ORIGINS'));
  const corsPrisma = new PrismaClient();

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? {
            useDefaults: true,
            directives: {
              defaultSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              connectSrc: ["'self'", 'https://api.mercadopago.com'],
            },
          }
        : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );

  const bodyLimit = config.get<string>('BODY_LIMIT') || '1mb';
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: async (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Sem Origin (curl, same-origin server-side, webhooks)
      if (!origin) {
        callback(null, true);
        return;
      }
      if (!isProd && staticOrigins.length === 0) {
        callback(null, true);
        return;
      }
      if (staticOrigins.includes(origin) || staticOrigins.includes('*')) {
        callback(null, true);
        return;
      }
      try {
        const host = normalizeCustomDomain(new URL(origin).host);
        if (!host) {
          callback(null, false);
          return;
        }
        const store = await corsPrisma.store.findFirst({
          where: {
            OR: [{ customDomain: host }, { customDomain: `www.${host}` }],
          },
          select: { id: true },
        });
        callback(null, Boolean(store));
      } catch {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-store-slug',
      'x-webhook-secret',
      'x-me-signature',
    ],
    maxAge: 86400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const port = config.get<number>('PORT') || 3000;
  await app.listen(port);
  console.log(`API rodando em http://localhost:${port}/api`);
  const webhook = buildMercadoPagoWebhookUrl(config);
  if (webhook) {
    console.log(`Webhook Mercado Pago: ${webhook}`);
  }
  if (isProd && staticOrigins.length === 0) {
    console.warn(
      '[segurança] Defina CORS_ORIGINS em produção (ex: https://seufront.com). Domínios custom das lojas são liberados automaticamente.',
    );
  }
  if (isProd && !config.get<string>('MP_WEBHOOK_SECRET')?.trim()) {
    console.warn('[segurança] MP_WEBHOOK_SECRET obrigatório em produção');
  }
  if (isProd && !config.get<string>('ENCRYPTION_KEY')?.trim()) {
    console.warn(
      '[segurança] ENCRYPTION_KEY não definida — tokens de Mercado Pago/frete/NFe ficam em texto puro no banco. Defina e rode scripts/encrypt-secrets.ts',
    );
  }
  if (isProd && !config.get<string>('SMTP_HOST')?.trim()) {
    console.warn(
      '[ops] SMTP_HOST não definido — recuperação de senha / e-mails não saem',
    );
  }
}

void bootstrap();
