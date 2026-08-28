import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
  resolveEncryptionKey,
} from '../utils/secret-crypto';

/** Campos de Store guardados cifrados. */
const STORE_SECRET_FIELDS = [
  'mpAccessToken',
  'freteToken',
  'nfeApiToken',
  'nfeCscToken',
] as const;

type StoreSecretField = (typeof STORE_SECRET_FIELDS)[number];

/**
 * Ponto único de cifra/decifra dos segredos de gateway.
 *
 * Quem lê um token do banco passa por aqui; quem grava, também. Assim a chave
 * fica em um lugar só e dá para trocar o algoritmo sem caçar call site.
 */
@Injectable()
export class SecretsService implements OnModuleInit {
  private readonly logger = new Logger(SecretsService.name);
  private readonly key: Buffer | null;
  private readonly isProd: boolean;

  constructor(config: ConfigService) {
    this.isProd = config.get<string>('NODE_ENV') === 'production';
    this.key = resolveEncryptionKey(config.get<string>('ENCRYPTION_KEY'));
  }

  onModuleInit() {
    if (!this.key) {
      const msg =
        'ENCRYPTION_KEY não definida — tokens de gateway ficam em TEXTO PURO no banco.';
      if (this.isProd) {
        this.logger.error(
          `[segurança] ${msg} Defina antes de ir para produção.`,
        );
      } else {
        this.logger.warn(`[segurança] ${msg}`);
      }
    }
  }

  get enabled(): boolean {
    return this.key !== null;
  }

  encrypt(plain: string | null | undefined): string | null {
    return encryptSecret(plain, this.key);
  }

  decrypt(value: string | null | undefined): string | null {
    return decryptSecret(value, this.key);
  }

  /** Decifra sem estourar — usado onde um token quebrado não deve derrubar a request. */
  decryptSafe(value: string | null | undefined): string | null {
    try {
      return this.decrypt(value);
    } catch (err) {
      this.logger.error(
        `Falha ao decifrar segredo: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /**
   * Devolve a loja com os campos de segredo já em texto claro.
   * Mutação no lugar de cópia para não perder o tipo do Prisma nos call sites.
   */
  decryptStore<T extends Partial<Record<StoreSecretField, string | null>>>(
    store: T,
  ): T {
    for (const field of STORE_SECRET_FIELDS) {
      const value = store[field];
      if (typeof value === 'string' && isEncrypted(value)) {
        (store as Record<string, unknown>)[field] = this.decryptSafe(value);
      }
    }
    return store;
  }
}
