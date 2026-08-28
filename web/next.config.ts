import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/** Proxy /api e /uploads para o Nest (evita 404 quando o front chama a própria porta). */
const API_ORIGIN = process.env.API_PROXY_TARGET || "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      { source: "/uploads/:path*", destination: `${API_ORIGIN}/uploads/:path*` },
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
