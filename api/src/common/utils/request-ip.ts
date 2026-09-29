import type { Request } from 'express';

/**
 * Atrás de proxy o IP real vem no X-Forwarded-For. Pega o primeiro da lista,
 * que é o cliente; os demais são os proxies do caminho.
 */
export function ipDaRequisicao(req: Request) {
  const encaminhado = req.headers['x-forwarded-for'];
  const bruto = Array.isArray(encaminhado) ? encaminhado[0] : encaminhado;
  if (bruto) return bruto.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'desconhecido';
}
