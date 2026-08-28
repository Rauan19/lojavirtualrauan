import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Criptografia dos segredos de gateway guardados no banco (access token do
 * Mercado Pago, token de frete, token da NFe...).
 *
 * Um dump do Postgres não pode entregar credencial que movimenta dinheiro em
 * nome dos lojistas — por isso esses campos vão cifrados.
 *
 * Formato: `enc.v1.<iv-base64>.<tag-base64>.<ciphertext-base64>` (AES-256-GCM).
 * Valor sem o prefixo é tratado como legado em texto puro e devolvido como
 * está, então bases antigas continuam funcionando até rodar a migração.
 */
const PREFIX = 'enc.v1.';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      'ENCRYPTION_KEY ausente ou inválida (esperado 32 bytes em hex ou base64)',
    );
  }
}

/**
 * Lê a chave do ambiente. Aceita 64 caracteres hex ou 32 bytes em base64.
 * `null` = criptografia desligada (dev); os valores ficam em texto puro.
 */
export function resolveEncryptionKey(raw: string | undefined): Buffer | null {
  const value = raw?.trim();
  if (!value) return null;

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, 'hex');
  }

  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 32) return decoded;

  throw new MissingEncryptionKeyError();
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/** Cifra o valor. Sem chave configurada, devolve o texto puro. */
export function encryptSecret(
  plain: string | null | undefined,
  key: Buffer | null,
): string | null {
  if (plain == null || plain === '') return null;
  if (!key) return plain;
  if (isEncrypted(plain)) return plain;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX.slice(0, -1),
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

/**
 * Decifra. Valor legado (sem prefixo) volta como está.
 * Valor cifrado sem chave configurada é erro — melhor falhar do que mandar
 * o ciphertext como se fosse credencial para o gateway.
 */
export function decryptSecret(
  value: string | null | undefined,
  key: Buffer | null,
): string | null {
  if (value == null || value === '') return null;
  if (!isEncrypted(value)) return value;
  if (!key) throw new MissingEncryptionKeyError();

  const parts = value.split('.');
  // enc . v1 . iv . tag . ciphertext
  if (parts.length !== 5) {
    throw new Error('Segredo cifrado em formato inválido');
  }

  const iv = Buffer.from(parts[2], 'base64');
  const tag = Buffer.from(parts[3], 'base64');
  const ciphertext = Buffer.from(parts[4], 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
