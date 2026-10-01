import type { Request } from 'express';

/**
 * IP do cliente, como o Express calcula com o `trust proxy` (ver
 * TRUST_PROXY_HOPS em main.ts).
 *
 * Não lê o primeiro valor do X-Forwarded-For: esse valor é escrito pelo
 * próprio cliente e dá para forjar à vontade. O Express conta os proxies de
 * trás para frente e só aceita o que um proxy nosso acrescentou.
 */
export function ipDaRequisicao(req: Request) {
  return req.ip || req.socket?.remoteAddress || 'desconhecido';
}

/**
 * Quantos proxies nossos ficam entre o visitante e a API.
 *
 * - 1: Nginx na frente (padrão). O Next repassa o cabeçalho sem acrescentar.
 * - 2: Cloudflare com proxy ligado (nuvem laranja) + Nginx.
 *
 * Errar para menos faz todo mundo parecer ter o IP do proxy (o limite de
 * requisições vira um só para a plataforma inteira); errar para mais deixa o
 * cliente forjar o IP.
 */
export function proxiesConfiaveis(valor: string | undefined): number {
  if (!valor?.trim()) return 1;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
}
