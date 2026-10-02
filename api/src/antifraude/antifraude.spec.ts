import { emailDescartavel } from './email-descartavel';
import { consultarCnpj } from './receita';
import { comAlerta, documentoDaContaMp } from './conta-mp';

const resposta = (status: number, corpo?: unknown) =>
  (() =>
    Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(corpo),
    } as Response)) as unknown as typeof fetch;

describe('e-mail descartável', () => {
  it('reconhece domínios temporários conhecidos', () => {
    expect(emailDescartavel('golpe@mailinator.com')).toBe(true);
    expect(emailDescartavel('x@YOPMAIL.COM')).toBe(true);
  });

  it('pega subdomínio de serviço temporário', () => {
    expect(emailDescartavel('x@abc.guerrillamail.com')).toBe(true);
  });

  it('não barra e-mail comum', () => {
    expect(emailDescartavel('maria@gmail.com')).toBe(false);
    expect(emailDescartavel('contato@minhaloja.com.br')).toBe(false);
    expect(emailDescartavel('sem-arroba')).toBe(false);
  });
});

describe('CNPJ na Receita (BrasilAPI)', () => {
  it('ativa', async () => {
    const r = await consultarCnpj(
      '11.222.333/0001-81',
      resposta(200, {
        descricao_situacao_cadastral: 'ATIVA',
        razao_social: 'EMPRESA X',
      }),
    );
    expect(r).toEqual({ status: 'ativa', razaoSocial: 'EMPRESA X' });
  });

  it('baixada/inapta vira inativa com a situação', async () => {
    const r = await consultarCnpj(
      '11222333000181',
      resposta(200, {
        descricao_situacao_cadastral: 'BAIXADA',
        razao_social: 'Y',
      }),
    );
    expect(r).toEqual({
      status: 'inativa',
      situacao: 'BAIXADA',
      razaoSocial: 'Y',
    });
  });

  it('404 é CNPJ que não existe', async () => {
    expect(await consultarCnpj('11222333000181', resposta(404))).toEqual({
      status: 'nao_encontrado',
    });
  });

  it('BrasilAPI no limite: confere no publica.cnpj.ws', async () => {
    const urls: string[] = [];
    const fetcher = (url: string) => {
      urls.push(url);
      return Promise.resolve(
        url.includes('brasilapi')
          ? ({
              status: 429,
              ok: false,
              json: () => Promise.resolve({}),
            } as Response)
          : ({
              status: 200,
              ok: true,
              json: () =>
                Promise.resolve({
                  razao_social: 'EMPRESA Z',
                  estabelecimento: { situacao_cadastral: 'Ativa' },
                }),
            } as Response),
      );
    };
    const r = await consultarCnpj('11222333000181', fetcher);
    expect(r).toEqual({ status: 'ativa', razaoSocial: 'EMPRESA Z' });
    expect(urls).toHaveLength(2);
  });

  it('erro, limite ou rede caída não trava o cadastro', async () => {
    expect((await consultarCnpj('11222333000181', resposta(429))).status).toBe(
      'indisponivel',
    );
    const quebrado = (() =>
      Promise.reject(new Error('rede'))) as unknown as typeof fetch;
    expect((await consultarCnpj('11222333000181', quebrado)).status).toBe(
      'indisponivel',
    );
  });
});

describe('documento da conta do Mercado Pago', () => {
  it('lê só os dígitos do documento', async () => {
    const doc = await documentoDaContaMp(
      'TOKEN',
      resposta(200, {
        identification: { type: 'CPF', number: '529.982.247-25' },
      }),
    );
    expect(doc).toBe('52998224725');
  });

  it('sem resposta ou sem documento devolve null', async () => {
    expect(await documentoDaContaMp('T', resposta(401))).toBeNull();
    expect(await documentoDaContaMp('T', resposta(200, {}))).toBeNull();
  });

  it('liga e desliga alerta sem repetir', () => {
    expect(comAlerta([], 'a', true)).toEqual(['a']);
    expect(comAlerta(['a', 'b'], 'a', true)).toEqual(['b', 'a']);
    expect(comAlerta(['a', 'b'], 'a', false)).toEqual(['b']);
  });
});
