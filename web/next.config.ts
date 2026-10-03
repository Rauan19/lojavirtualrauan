import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

/** Proxy /api e /uploads para o Nest (evita 404 quando o front chama a própria porta). */
const API_ORIGIN = process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001';

/**
 * Cabeçalhos de segurança em todas as páginas.
 *
 * - frame-ancestors 'self': ninguém abre o painel dentro de um iframe de
 *   outro site (clickjacking: o lojista clica num botão que não vê). O
 *   checkout do Mercado Pago continua funcionando: são os iframes DELE dentro
 *   da nossa página, não o contrário.
 * - Só o frame-ancestors na CSP, de propósito: uma CSP completa precisaria
 *   liberar o Mercado Pago, o Analytics e o Pixel de cada loja, e um erro ali
 *   quebra o checkout.
 * - HSTS só em produção, sem includeSubDomains: domínio próprio de lojista
 *   também passa por aqui e não é nosso decidir pelos subdomínios dele.
 */
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
      {
        source: '/uploads/:path*',
        destination: `${API_ORIGIN}/uploads/:path*`,
      },
    ];
  },
};

// Sem SENTRY_ORG/SENTRY_PROJECT o wrapper só passa o config adiante — não
// exige conta configurada para buildar em dev.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true } },
  // Sourcemap só sobe se houver credencial — sem isso o build não falha,
  // só não manda sourcemap (stack trace no Sentry fica minificado).
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
