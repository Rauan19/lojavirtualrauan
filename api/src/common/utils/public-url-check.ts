/*
 * Diagnóstico da URL pública.
 *
 * Todo webhook do Mercado Pago — mensalidade e pedidos das lojas — é montado
 * a partir de PUBLIC_URL. Quando ela está errada, nada explode: os pagamentos
 * continuam sendo criados, o cliente paga, e o pedido simplesmente nunca sai
 * de "aguardando pagamento". A falha é silenciosa, e é por isso que ela
 * precisa de um teste explícito em vez de confiança.
 *
 * O caso mais traiçoeiro não é a variável vazia: é a que aponta para um túnel
 * de desenvolvimento que já morreu. Parece configurada.
 */

export type DiagnosticoUrl =
  | { ok: false; motivo: 'ausente'; detalhe: string }
  | { ok: false; motivo: 'local'; detalhe: string }
  | { ok: false; motivo: 'sem_https'; detalhe: string }
  | { ok: true; url: string; tunel: boolean };

const HOSTS_LOCAIS = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];

/** Domínios de túnel de desenvolvimento: funcionam, mas caem sozinhos. */
const DOMINIOS_TUNEL = [
  'ngrok-free.app',
  'ngrok.io',
  'ngrok.app',
  'loca.lt',
  'trycloudflare.com',
  'serveo.net',
];

export function analisarPublicUrl(bruta?: string | null): DiagnosticoUrl {
  const valor = (bruta || '').trim().replace(/\/$/, '');
  if (!valor) {
    return {
      ok: false,
      motivo: 'ausente',
      detalhe:
        'PUBLIC_URL não está definida. Sem ela o notification_url não é enviado ao Mercado Pago e nenhum pagamento é confirmado sozinho.',
    };
  }

  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return {
      ok: false,
      motivo: 'ausente',
      detalhe: `PUBLIC_URL inválida: "${valor}".`,
    };
  }

  const host = url.hostname.toLowerCase();
  if (HOSTS_LOCAIS.includes(host) || host.endsWith('.local')) {
    return {
      ok: false,
      motivo: 'local',
      detalhe:
        'PUBLIC_URL aponta para a própria máquina. O Mercado Pago precisa alcançar essa URL pela internet.',
    };
  }

  if (url.protocol !== 'https:') {
    return {
      ok: false,
      motivo: 'sem_https',
      detalhe: 'O Mercado Pago só chama webhooks em HTTPS.',
    };
  }

  return {
    ok: true,
    url: valor,
    tunel: DOMINIOS_TUNEL.some((d) => host === d || host.endsWith(`.${d}`)),
  };
}
