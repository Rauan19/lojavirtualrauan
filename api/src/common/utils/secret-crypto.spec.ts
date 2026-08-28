import { randomBytes } from 'crypto';
import {
  MissingEncryptionKeyError,
  decryptSecret,
  encryptSecret,
  isEncrypted,
  resolveEncryptionKey,
} from './secret-crypto';

const KEY = randomBytes(32);
const TOKEN = 'APP_USR-1234567890123456-081412-abcdef-987654321';

describe('secret-crypto', () => {
  describe('resolveEncryptionKey', () => {
    it('aceita hex de 64 caracteres', () => {
      const hex = KEY.toString('hex');
      expect(resolveEncryptionKey(hex)).toEqual(KEY);
    });

    it('aceita base64 de 32 bytes', () => {
      expect(resolveEncryptionKey(KEY.toString('base64'))).toEqual(KEY);
    });

    it('devolve null quando não configurada', () => {
      expect(resolveEncryptionKey(undefined)).toBeNull();
      expect(resolveEncryptionKey('')).toBeNull();
      expect(resolveEncryptionKey('   ')).toBeNull();
    });

    it('rejeita chave de tamanho errado', () => {
      expect(() => resolveEncryptionKey('curta-demais')).toThrow(
        MissingEncryptionKeyError,
      );
    });
  });

  describe('encrypt/decrypt', () => {
    it('faz round-trip', () => {
      const cipher = encryptSecret(TOKEN, KEY);
      expect(decryptSecret(cipher, KEY)).toBe(TOKEN);
    });

    it('não deixa o token aparecer no valor guardado', () => {
      const cipher = encryptSecret(TOKEN, KEY)!;
      expect(cipher).not.toContain(TOKEN);
      expect(cipher).not.toContain('APP_USR');
      expect(isEncrypted(cipher)).toBe(true);
    });

    it('gera ciphertext diferente a cada chamada (IV aleatório)', () => {
      expect(encryptSecret(TOKEN, KEY)).not.toBe(encryptSecret(TOKEN, KEY));
    });

    it('não cifra duas vezes', () => {
      const once = encryptSecret(TOKEN, KEY)!;
      expect(encryptSecret(once, KEY)).toBe(once);
    });

    it('rejeita ciphertext adulterado (AES-GCM autentica)', () => {
      const cipher = encryptSecret(TOKEN, KEY)!;
      const parts = cipher.split('.');
      const tampered = Buffer.from(parts[4], 'base64');
      tampered[0] ^= 0xff;
      parts[4] = tampered.toString('base64');

      expect(() => decryptSecret(parts.join('.'), KEY)).toThrow();
    });

    it('não decifra com a chave errada', () => {
      const cipher = encryptSecret(TOKEN, KEY);
      expect(() => decryptSecret(cipher, randomBytes(32))).toThrow();
    });

    it('devolve valor legado em texto puro como está', () => {
      // bases anteriores à criptografia continuam funcionando
      expect(decryptSecret(TOKEN, KEY)).toBe(TOKEN);
      expect(decryptSecret(TOKEN, null)).toBe(TOKEN);
    });

    it('sem chave, passa em claro em vez de quebrar o dev', () => {
      expect(encryptSecret(TOKEN, null)).toBe(TOKEN);
    });

    it('falha alto ao ler cifrado sem a chave (não manda lixo pro gateway)', () => {
      const cipher = encryptSecret(TOKEN, KEY);
      expect(() => decryptSecret(cipher, null)).toThrow(
        MissingEncryptionKeyError,
      );
    });

    it('normaliza vazio para null', () => {
      expect(encryptSecret(null, KEY)).toBeNull();
      expect(encryptSecret('', KEY)).toBeNull();
      expect(decryptSecret(null, KEY)).toBeNull();
    });
  });
});
