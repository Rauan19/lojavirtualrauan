import { analisarPublicUrl } from './public-url-check';

/*
 * PUBLIC_URL errada não quebra nada visivelmente: o pagamento é criado, o
 * cliente paga, e o pedido fica parado em "aguardando pagamento" para sempre.
 * Por isso cada modo de erro tem teste.
 */
describe('diagnóstico da PUBLIC_URL', () => {
  it('aceita um domínio público em https', () => {
    expect(analisarPublicUrl('https://api.minhaloja.com.br')).toEqual({
      ok: true,
      url: 'https://api.minhaloja.com.br',
      tunel: false,
    });
  });

  it('tira a barra do fim, que duplicaria na montagem da URL', () => {
    const r = analisarPublicUrl('https://api.minhaloja.com.br/');
    expect(r).toMatchObject({ ok: true, url: 'https://api.minhaloja.com.br' });
  });

  it('reprova quando está vazia', () => {
    expect(analisarPublicUrl('')).toMatchObject({ motivo: 'ausente' });
    expect(analisarPublicUrl(null)).toMatchObject({ motivo: 'ausente' });
    expect(analisarPublicUrl('   ')).toMatchObject({ motivo: 'ausente' });
  });

  it('reprova texto que não é URL', () => {
    expect(analisarPublicUrl('meu-servidor')).toMatchObject({
      motivo: 'ausente',
    });
  });

  it('reprova localhost — o Mercado Pago precisa alcançar de fora', () => {
    for (const u of [
      'http://localhost:3000',
      'https://127.0.0.1:3000',
      'http://0.0.0.0:3000',
      'https://api.local',
    ]) {
      expect(analisarPublicUrl(u)).toMatchObject({ motivo: 'local' });
    }
  });

  it('reprova http — o Mercado Pago só chama webhook em https', () => {
    expect(analisarPublicUrl('http://api.minhaloja.com.br')).toMatchObject({
      motivo: 'sem_https',
    });
  });

  describe('túnel de desenvolvimento', () => {
    /*
     * Túnel funciona, então não é erro. Mas cai sozinho, e aí a URL continua
     * parecendo configurada enquanto nenhum webhook chega — o pior dos dois
     * mundos. Marcar permite o painel avisar.
     */
    it('marca ngrok como túnel', () => {
      expect(
        analisarPublicUrl('https://da49-170-81-63-101.ngrok-free.app'),
      ).toEqual({
        ok: true,
        url: 'https://da49-170-81-63-101.ngrok-free.app',
        tunel: true,
      });
    });

    it('marca cloudflare e localtunnel', () => {
      expect(analisarPublicUrl('https://algo.trycloudflare.com')).toMatchObject(
        { tunel: true },
      );
      expect(analisarPublicUrl('https://algo.loca.lt')).toMatchObject({
        tunel: true,
      });
    });

    it('não confunde domínio próprio com túnel', () => {
      expect(
        analisarPublicUrl('https://ngrok-free.app.minhaloja.com.br'),
      ).toMatchObject({ tunel: false });
    });
  });
});
