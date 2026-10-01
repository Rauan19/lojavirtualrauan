import { createHash, createHmac, randomBytes, randomInt } from 'crypto';

/**
 * Código de verificação em duas etapas (TOTP, RFC 6238) — o mesmo padrão do
 * Google Authenticator, Microsoft Authenticator, Bitwarden e afins.
 *
 * Servidor e celular guardam a mesma chave e calculam o código, cada um do
 * seu lado, a partir da hora: nada sai do servidor, não há serviço externo
 * nem custo. Código de 6 dígitos, troca a cada 30 segundos, HMAC-SHA1 (o que
 * todos os apps aceitam).
 */

const PASSO_S = 30;
const DIGITOS = 6;
/** Aceita o código do passo anterior e do seguinte (relógio do celular adiantado/atrasado). */
const JANELA = 1;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let valor = 0;
  let out = '';
  for (const byte of buf) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(valor << (5 - bits)) & 31];
  return out;
}

export function base32Decode(texto: string): Buffer {
  const limpo = texto.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let valor = 0;
  const out: number[] = [];
  for (const ch of limpo) {
    const i = BASE32.indexOf(ch);
    if (i < 0) throw new Error('Chave inválida');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Chave nova de 160 bits, em base32 (o formato que os apps leem). */
export function gerarSegredo(): string {
  return base32Encode(randomBytes(20));
}

export function passoAtual(agoraMs = Date.now()): number {
  return Math.floor(agoraMs / 1000 / PASSO_S);
}

/** Código de um passo de tempo (RFC 4226, truncamento dinâmico). */
export function codigoDoPasso(
  chave: Buffer,
  passo: number,
  digitos = DIGITOS,
): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = createHmac('sha1', chave).update(contador).digest();
  const desloc = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[desloc] & 0x7f) << 24) |
    (hmac[desloc + 1] << 16) |
    (hmac[desloc + 2] << 8) |
    hmac[desloc + 3];
  return String(binario % 10 ** digitos).padStart(digitos, '0');
}

/**
 * Confere o código digitado. Devolve o passo usado (para gravar e impedir
 * que o mesmo código seja usado de novo) ou null.
 *
 * `ultimoPasso`: o último passo já aceito para esta conta. Código desse passo
 * ou anterior é recusado — quem viu o código por cima do ombro não reaproveita.
 */
export function verificarCodigo(
  segredoBase32: string,
  codigo: string,
  ultimoPasso: number | null,
  agoraMs = Date.now(),
): number | null {
  const digitado = codigo.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(digitado)) return null;
  const chave = base32Decode(segredoBase32);
  const atual = passoAtual(agoraMs);
  for (let d = -JANELA; d <= JANELA; d++) {
    const passo = atual + d;
    if (ultimoPasso != null && passo <= ultimoPasso) continue;
    if (iguais(codigoDoPasso(chave, passo), digitado)) return passo;
  }
  return null;
}

/** Comparação em tempo constante (não vaza quantos dígitos acertou). */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/** Endereço que vai no QR code; os apps leem esse formato. */
export function enderecoOtpauth(
  emissor: string,
  conta: string,
  segredoBase32: string,
): string {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  const params = new URLSearchParams({
    secret: segredoBase32,
    issuer: emissor,
    algorithm: 'SHA1',
    digits: String(DIGITOS),
    period: String(PASSO_S),
  });
  return `otpauth://totp/${rotulo}?${params.toString()}`;
}

/** Sem 0/O, 1/I/L: o lojista vai ler isso num papel. */
const ALFABETO_RECUPERACAO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** 10 códigos de recuperação "XXXXX-XXXXX" (~50 bits cada). */
export function gerarCodigosRecuperacao(qtd = 10): string[] {
  return Array.from({ length: qtd }, () => {
    let s = '';
    for (let i = 0; i < 10; i++) {
      s += ALFABETO_RECUPERACAO[randomInt(ALFABETO_RECUPERACAO.length)];
    }
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

/** Só o hash vai para o banco: vazou o banco, os códigos não servem. */
export function hashRecuperacao(codigo: string): string {
  const normal = codigo.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return createHash('sha256').update(`vendira-2fa:${normal}`).digest('hex');
}
