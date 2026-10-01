import { acessoDaRota, caminhoDaRota, funcionarioPode } from './areas';

describe('áreas do painel por rota', () => {
  it('tira /api, query e barra do fim', () => {
    expect(caminhoDaRota('/api/admin/orders/?page=2')).toBe('/admin/orders');
    expect(caminhoDaRota('/api/stores/me')).toBe('/stores/me');
  });

  it('livre para toda a equipe', () => {
    expect(acessoDaRota('GET', '/api/auth/me')).toBe('livre');
    expect(acessoDaRota('GET', '/api/admin/dashboard/summary')).toBe('livre');
    expect(acessoDaRota('GET', '/api/stores/me')).toBe('livre');
  });

  it('alterar a loja não é livre (só ler)', () => {
    expect(acessoDaRota('PATCH', '/api/stores/me/branding')).toEqual([
      'configuracoes',
    ]);
  });

  it('funcionário de pedidos mexe em pedidos e não em produtos', () => {
    const p = ['pedidos'];
    expect(funcionarioPode(p, 'PATCH', '/api/admin/orders/abc/status')).toBe(
      true,
    );
    expect(funcionarioPode(p, 'GET', '/api/admin/refunds')).toBe(true);
    expect(funcionarioPode(p, 'POST', '/api/admin/products')).toBe(false);
  });

  it('upload vale para produtos ou configurações', () => {
    expect(
      funcionarioPode(['configuracoes'], 'POST', '/api/admin/uploads'),
    ).toBe(true);
    expect(funcionarioPode(['clientes'], 'POST', '/api/admin/uploads')).toBe(
      false,
    );
  });

  it('dinheiro e equipe são só do dono, mesmo com todas as áreas', () => {
    const todas = [
      'pedidos',
      'produtos',
      'clientes',
      'marketing',
      'configuracoes',
    ];
    for (const url of [
      '/api/billing/me',
      '/api/billing/free',
      '/api/platform-fee/me',
      '/api/stores/me/mercadopago',
      '/api/admin/payments/mercadopago/authorize',
      '/api/admin/equipe',
    ]) {
      expect(funcionarioPode(todas, 'GET', url)).toBe(false);
    }
  });

  it('rota que ninguém mapeou nasce fechada para funcionário', () => {
    expect(acessoDaRota('GET', '/api/admin/rota-nova-qualquer')).toBe('dono');
    expect(funcionarioPode(['pedidos'], 'GET', '/api/stores')).toBe(false);
  });

  it('não confunde prefixo parecido', () => {
    expect(acessoDaRota('GET', '/api/admin/ordersx')).toBe('dono');
  });
});
