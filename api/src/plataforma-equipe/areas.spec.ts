import { colaboradorPode } from './areas';

describe('áreas do Super Admin (colaborador)', () => {
  it('auth é de todos: me, troca de senha e 2FA', () => {
    expect(colaboradorPode([], 'GET', '/api/auth/me')).toBe(true);
    expect(colaboradorPode([], 'POST', '/api/auth/trocar-senha')).toBe(true);
    expect(colaboradorPode([], 'POST', '/api/auth/2fa/ativar')).toBe(true);
  });

  it('lojas libera lista, ficha, edição e status, e nada de painel de loja', () => {
    const p = ['lojas'];
    expect(colaboradorPode(p, 'GET', '/api/stores')).toBe(true);
    expect(colaboradorPode(p, 'POST', '/api/stores')).toBe(true);
    expect(colaboradorPode(p, 'GET', '/api/stores/abc123')).toBe(true);
    expect(colaboradorPode(p, 'PATCH', '/api/stores/abc123')).toBe(true);
    expect(colaboradorPode(p, 'PATCH', '/api/stores/abc123/status')).toBe(true);
    expect(colaboradorPode(p, 'GET', '/api/stores/me')).toBe(false);
    expect(colaboradorPode(p, 'PATCH', '/api/stores/me/mercadopago')).toBe(
      false,
    );
    expect(colaboradorPode(p, 'GET', '/api/stores/billing')).toBe(false);
    expect(colaboradorPode(p, 'GET', '/api/admin/orders')).toBe(false);
  });

  it('planos, comissões e templates só com a área certa', () => {
    expect(
      colaboradorPode(['planos'], 'GET', '/api/billing/platform/plans'),
    ).toBe(true);
    expect(colaboradorPode(['planos'], 'GET', '/api/stores/billing')).toBe(
      true,
    );
    expect(
      colaboradorPode(
        ['comissoes'],
        'GET',
        '/api/platform-fee/relatorio?mes=2026-10',
      ),
    ).toBe(true);
    expect(
      colaboradorPode(['comissoes'], 'PATCH', '/api/platform-fee/lojas/abc'),
    ).toBe(true);
    expect(colaboradorPode(['templates'], 'POST', '/api/super/templates')).toBe(
      true,
    );
    // lista de planos: lojas e templates só leem
    expect(
      colaboradorPode(['lojas'], 'GET', '/api/billing/platform/plans'),
    ).toBe(true);
    expect(
      colaboradorPode(['templates'], 'POST', '/api/billing/platform/plans'),
    ).toBe(false);
    expect(colaboradorPode(['lojas'], 'POST', '/api/super/templates')).toBe(
      false,
    );
  });

  it('comissões: resumo, lojas paginadas, divergências e CSV', () => {
    const c = ['comissoes'];
    for (const url of [
      '/api/platform-fee/relatorio?mes=2026-10',
      '/api/platform-fee/relatorio/lojas?pagina=2',
      '/api/platform-fee/relatorio.csv',
      '/api/platform-fee/divergencias?pagina=1',
    ]) {
      expect(colaboradorPode(c, 'GET', url)).toBe(true);
      expect(colaboradorPode(['lojas'], 'GET', url)).toBe(false);
    }
  });

  it('Mercado Pago da plataforma, equipe e rota desconhecida: só o dono', () => {
    const todas = ['lojas', 'planos', 'comissoes', 'templates'];
    expect(
      colaboradorPode(todas, 'GET', '/api/billing/platform/mercadopago'),
    ).toBe(false);
    expect(colaboradorPode(todas, 'GET', '/api/super/equipe')).toBe(false);
    expect(colaboradorPode(todas, 'GET', '/api/super/rota-nova')).toBe(false);
    expect(colaboradorPode(todas, 'GET', '/api/platform-fee/me')).toBe(false);
  });
});
