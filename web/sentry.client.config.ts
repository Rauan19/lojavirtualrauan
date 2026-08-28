/**
 * Erros do navegador (JS quebrando na tela do cliente/lojista). Sem
 * SENTRY_DSN definido o SDK simplesmente não inicializa nada.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0.1,
    ),
  });
}
