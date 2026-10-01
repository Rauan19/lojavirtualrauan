/**
 * Áreas do painel que um funcionário pode receber, e a área de cada rota.
 *
 * Seguro por padrão: rota do painel que não está na lista é só do dono. Uma
 * rota nova que alguém esquecer de mapear nasce fechada para funcionário.
 */
export const AREAS = {
  pedidos: 'Pedidos e reembolsos',
  produtos: 'Produtos, categorias, promoções e avaliações',
  clientes: 'Clientes',
  marketing: 'Cupons, Google e Instagram, Avise-me e carrinhos abandonados',
  configuracoes: 'Aparência, frete, políticas, impressora e nota fiscal',
} as const;

export type Area = keyof typeof AREAS;

export function areaValida(a: string): a is Area {
  return Object.prototype.hasOwnProperty.call(AREAS, a);
}

/** 'livre' = toda a equipe; 'dono' = só o dono; senão, as áreas que liberam. */
export type Acesso = 'livre' | 'dono' | Area[];

const REGRAS: [RegExp, Acesso, string?][] = [
  // Toda a equipe
  [/^\/auth(\/|$)/, 'livre'],
  [/^\/admin\/dashboard(\/|$)/, 'livre'],
  [/^\/stores\/me$/, 'livre', 'GET'],
  [/^\/stores\/me\/store-type-config$/, 'livre', 'GET'],
  // Cada um liga os avisos no próprio celular (o envio filtra quem vê pedidos)
  [/^\/admin\/avisos(\/|$)/, 'livre'],

  // Por área
  [/^\/admin\/(orders|refunds)(\/|$)/, ['pedidos']],
  [/^\/admin\/(products|categories|promotions|reviews)(\/|$)/, ['produtos']],
  // Upload serve foto de produto e logo/banner da loja
  [/^\/admin\/uploads(\/|$)/, ['produtos', 'configuracoes']],
  [/^\/admin\/customers(\/|$)/, ['clientes']],
  [
    /^\/admin\/(coupons|catalogo|avise-me|carrinhos-abandonados)(\/|$)/,
    ['marketing'],
  ],
  [
    /^\/stores\/me\/(branding|policies|shipping|printer|nfe|profile)(\/|$)/,
    ['configuracoes'],
  ],
  [/^\/admin\/shipping(\/|$)/, ['configuracoes']],

  // Só o dono: dinheiro e quem entra na loja
  [/^\/stores\/me\/mercadopago(\/|$)/, 'dono'],
  [/^\/admin\/payments(\/|$)/, 'dono'],
  [/^\/admin\/equipe(\/|$)/, 'dono'],
  [/^\/billing(\/|$)/, 'dono'],
  [/^\/platform-fee(\/|$)/, 'dono'],
];

/** Caminho sem o prefixo /api e sem a query. */
export function caminhoDaRota(url: string): string {
  const semQuery = url.split('?')[0] || '/';
  const semApi = semQuery.replace(/^\/api(?=\/|$)/, '') || '/';
  return semApi.length > 1 ? semApi.replace(/\/+$/, '') : semApi;
}

export function acessoDaRota(metodo: string, url: string): Acesso {
  const caminho = caminhoDaRota(url);
  const m = metodo.toUpperCase();
  for (const [re, acesso, soMetodo] of REGRAS) {
    if (soMetodo && soMetodo !== m) continue;
    if (re.test(caminho)) return acesso;
  }
  return 'dono';
}

/** O funcionário com estas permissões pode usar esta rota? */
export function funcionarioPode(
  permissoes: readonly string[],
  metodo: string,
  url: string,
): boolean {
  const acesso = acessoDaRota(metodo, url);
  if (acesso === 'livre') return true;
  if (acesso === 'dono') return false;
  return acesso.some((a) => permissoes.includes(a));
}
