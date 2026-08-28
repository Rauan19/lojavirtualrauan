/** Extrai hostname limpo: sem protocolo, path, porta ou www opcional. */
export function normalizeCustomDomain(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  let v = String(raw).trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^https?:\/\//, '');
  v = v.split('/')[0] || '';
  v = v.split('?')[0] || '';
  v = v.replace(/:\d+$/, '');
  v = v.replace(/^www\./, '');
  if (!v || v === 'localhost' || v.startsWith('127.')) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) {
    // aceita subdomínios tipo loja.meudominio.com.br
    if (
      !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(
        v,
      )
    ) {
      return null;
    }
  }
  return v;
}
