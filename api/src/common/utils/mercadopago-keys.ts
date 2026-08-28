/** Formato típico da Public Key do Mercado Pago (UUID após TEST-/APP_USR-). */
const MP_PUBLIC_KEY_RE =
  /^(TEST|APP_USR)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Access Token costuma ser APP_USR-/TEST- + número longo + mais segmentos. */
const MP_ACCESS_TOKEN_RE = /^(TEST|APP_USR)-\d{10,}-/;

export type MercadoPagoKeyEnv = 'test' | 'prod';

export function isMercadoPagoPublicKey(value: string): boolean {
  return MP_PUBLIC_KEY_RE.test(value.trim());
}

export function looksLikeMercadoPagoAccessToken(value: string): boolean {
  const v = value.trim();
  if (MP_PUBLIC_KEY_RE.test(v)) return false;
  return MP_ACCESS_TOKEN_RE.test(v) || v.length > 90;
}

/** Detecta ambiente pelo prefixo TEST- vs APP_USR-. */
export function mercadoPagoKeyEnv(value: string): MercadoPagoKeyEnv | null {
  const v = value.trim();
  if (v.startsWith('TEST-')) return 'test';
  if (v.startsWith('APP_USR-')) return 'prod';
  return null;
}

export function assertMercadoPagoKeyPair(input: {
  publicKey?: string | null;
  accessToken?: string | null;
}): void {
  const pk = input.publicKey?.trim() || '';
  const at = input.accessToken?.trim() || '';

  if (pk && at && pk === at) {
    throw new Error(
      'Public Key e Access Token estão iguais. No painel MP, copie a Public Key (bloco da esquerda / frontend) e o Access Token (direita / backend) — são valores diferentes.',
    );
  }

  if (pk && looksLikeMercadoPagoAccessToken(pk)) {
    throw new Error(
      'O campo Public Key parece um Access Token. Cole a Public Key (formato TEST-uuid ou APP_USR-uuid). O Access Token fica só no backend.',
    );
  }

  if (
    pk &&
    !isMercadoPagoPublicKey(pk) &&
    !looksLikeMercadoPagoAccessToken(pk)
  ) {
    // Aceita formatos menos comuns, mas avisa se for muito curto
    if (pk.length < 20) {
      throw new Error('Public Key do Mercado Pago inválida (muito curta).');
    }
  }

  const pkEnv = pk ? mercadoPagoKeyEnv(pk) : null;
  const atEnv = at ? mercadoPagoKeyEnv(at) : null;
  if (pkEnv && atEnv && pkEnv !== atEnv) {
    throw new Error(
      'Public Key e Access Token são de ambientes diferentes (uma TEST-, outra APP_USR-). No painel MP, copie as duas do mesmo bloco: Credenciais de teste OU Credenciais de produção.',
    );
  }
}
