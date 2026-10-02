/*
 * Documento (CPF/CNPJ) da conta do Mercado Pago que o lojista conectou. O MP
 * já verificou essa pessoa (KYC); se o documento não bate com o informado no
 * cadastro da loja, alguém pode estar usando dados de terceiros.
 */
export async function documentoDaContaMp(
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetcher('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const dados = (await res.json()) as {
      identification?: { number?: string | number | null } | null;
    };
    const numero = String(dados.identification?.number ?? '').replace(
      /\D/g,
      '',
    );
    return numero || null;
  } catch {
    return null;
  }
}

/** Liga ou desliga um alerta na lista, sem repetir */
export function comAlerta(lista: string[], alerta: string, ligado: boolean) {
  const sem = lista.filter((a) => a !== alerta);
  return ligado ? [...sem, alerta] : sem;
}
