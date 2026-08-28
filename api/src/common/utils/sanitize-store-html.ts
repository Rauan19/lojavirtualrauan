import sanitizeHtml from 'sanitize-html';

/**
 * Limpa o HTML das políticas da loja (termos, privacidade, trocas).
 *
 * Esse conteúdo é escrito pelo lojista e renderizado com
 * `dangerouslySetInnerHTML` na vitrine. Como todas as lojas dividem a mesma
 * origem em `app.com/loja/{slug}/...`, HTML cru aqui deixava um lojista
 * roubar sessão de cliente (e de admin) de OUTRAS lojas.
 *
 * Allowlist deliberadamente pequena: formatação de texto e link, mais nada.
 * Sem `style` (overlay/clickjacking), sem `iframe`, sem `img` remota.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'ul',
    'ol',
    'li',
    'h2',
    'h3',
    'h4',
    'blockquote',
    'a',
    'hr',
    'span',
    'div',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
  },
  // Nada de javascript:, data: ou vbscript:
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],
  // Link externo não deve dar acesso a window.opener
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      rel: 'noopener noreferrer nofollow',
    }),
  },
  disallowedTagsMode: 'discard',
};

export function sanitizeStoreHtml(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const cleaned = sanitizeHtml(raw, OPTIONS).trim();
  return cleaned === '' ? null : cleaned;
}
