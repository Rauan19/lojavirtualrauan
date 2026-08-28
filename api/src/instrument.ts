/**
 * Precisa ser importado ANTES de qualquer outra coisa em main.ts — é assim
 * que o Sentry consegue interceptar chamadas HTTP, Postgres etc.
 * Sem SENTRY_DSN definido isso não faz nada (fica em log local mesmo).
 */
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    integrations: [nodeProfilingIntegration()],
    // Amostragem baixa por padrão — telemetria de performance não é o
    // objetivo principal aqui, é rastrear erro. Ajustável via env.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    profileSessionSampleRate: Number(
      process.env.SENTRY_PROFILES_SAMPLE_RATE || 0.1,
    ),
    release: process.env.SENTRY_RELEASE || undefined,
  });
}
