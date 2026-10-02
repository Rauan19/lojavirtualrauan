/*
 * Consulta de CNPJ na Receita Federal (BrasilAPI e publica.cnpj.ws, grátis).
 * CPF não tem consulta oficial gratuita: fica com o dígito verificador e com
 * a conferência contra a conta do Mercado Pago, que já passou por KYC.
 *
 * Se a BrasilAPI cair ou demorar, o resultado é "indisponivel": o cadastro
 * segue e a loja ganha um alerta para revisão, em vez de travar a venda de
 * quem é honesto por causa de um serviço de terceiro.
 */
export type ResultadoCnpj =
  | { status: 'ativa'; razaoSocial: string }
  | { status: 'inativa'; situacao: string; razaoSocial: string }
  | { status: 'nao_encontrado' }
  | { status: 'indisponivel' };

/**
 * Consulta na BrasilAPI e, se ela falhar (limite de uso, fora do ar), no
 * publica.cnpj.ws. Os dois são grátis e limitam poucas consultas por minuto:
 * um segundo serviço reduz bem os cadastros que ficam "não verificados".
 */
export async function consultarCnpj(
  cnpj: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 6000,
): Promise<ResultadoCnpj> {
  const primeiro = await consultarBrasilApi(cnpj, fetcher, timeoutMs);
  if (primeiro.status !== 'indisponivel') return primeiro;
  return consultarCnpjWs(cnpj, fetcher, timeoutMs);
}

async function consultarCnpjWs(
  cnpj: string,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<ResultadoCnpj> {
  const digitos = cnpj.replace(/\D/g, '');
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);
  try {
    const res = await fetcher(`https://publica.cnpj.ws/cnpj/${digitos}`, {
      headers: { Accept: 'application/json' },
      signal: controle.signal,
    });
    if (res.status === 404) return { status: 'nao_encontrado' };
    if (!res.ok) return { status: 'indisponivel' };
    const dados = (await res.json()) as {
      razao_social?: string;
      estabelecimento?: { situacao_cadastral?: string } | null;
    };
    const situacao = (dados.estabelecimento?.situacao_cadastral || '')
      .trim()
      .toUpperCase();
    const razaoSocial = (dados.razao_social || '').trim();
    if (!situacao) return { status: 'indisponivel' };
    if (situacao === 'ATIVA') return { status: 'ativa', razaoSocial };
    return { status: 'inativa', situacao, razaoSocial };
  } catch {
    return { status: 'indisponivel' };
  } finally {
    clearTimeout(timer);
  }
}

async function consultarBrasilApi(
  cnpj: string,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<ResultadoCnpj> {
  const digitos = cnpj.replace(/\D/g, '');
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);
  try {
    const res = await fetcher(
      `https://brasilapi.com.br/api/cnpj/v1/${digitos}`,
      {
        headers: { Accept: 'application/json' },
        signal: controle.signal,
      },
    );
    if (res.status === 404) return { status: 'nao_encontrado' };
    if (!res.ok) return { status: 'indisponivel' };
    const dados = (await res.json()) as {
      descricao_situacao_cadastral?: string;
      razao_social?: string;
    };
    const situacao = (dados.descricao_situacao_cadastral || '')
      .trim()
      .toUpperCase();
    const razaoSocial = (dados.razao_social || '').trim();
    if (!situacao) return { status: 'indisponivel' };
    if (situacao === 'ATIVA') return { status: 'ativa', razaoSocial };
    return { status: 'inativa', situacao, razaoSocial };
  } catch {
    return { status: 'indisponivel' };
  } finally {
    clearTimeout(timer);
  }
}
