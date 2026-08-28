import { SetMetadata } from '@nestjs/common';

export const ALLOW_PAST_DUE_KEY = 'allowPastDue';

/**
 * Libera a rota mesmo com a loja inadimplente (PAST_DUE).
 * Usar só no que o lojista precisa para voltar a pagar (planos, assinatura).
 */
export const AllowPastDue = () => SetMetadata(ALLOW_PAST_DUE_KEY, true);
