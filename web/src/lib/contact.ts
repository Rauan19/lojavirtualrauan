function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

/**
 * Contato da página de vendas / suporte da plataforma.
 *
 * Vem do ambiente para não subir com número de exemplo. Defina em `.env.local`:
 *   NEXT_PUBLIC_CONTACT_WHATSAPP="5511988887777"
 *   NEXT_PUBLIC_CONTACT_EMAIL="contato@seudominio.com.br"
 */
export const CONTACT = {
  whatsapp: onlyDigits(process.env.NEXT_PUBLIC_CONTACT_WHATSAPP || ''),
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || '',
};

/** Sem número configurado não adianta renderizar botão de WhatsApp. */
export const HAS_PLATFORM_WHATSAPP = CONTACT.whatsapp.length >= 12;

/** Máscara BR: (11) 99999-9999 ou (11) 9999-9999 */
export function formatPhoneBr(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Normaliza telefone BR para wa.me (com DDI 55 quando faltar). */
export function normalizeWhatsappNumber(phone: string) {
  const digits = onlyDigits(phone);
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** `null` quando não há WhatsApp da plataforma configurado. */
export function whatsappHref(message?: string) {
  if (!HAS_PLATFORM_WHATSAPP) return null;
  const text = encodeURIComponent(
    message ??
      'Olá! Quero um orçamento para montar a loja virtual do meu negócio.',
  );
  return `https://wa.me/${CONTACT.whatsapp}?text=${text}`;
}

/** WhatsApp do vendedor/loja (página do produto na vitrine). */
export function sellerWhatsappHref(
  phone: string,
  message?: string,
) {
  const number = normalizeWhatsappNumber(phone);
  if (!number) return null;
  const text = encodeURIComponent(
    message ?? 'Olá! Vi um produto na loja e gostaria de conversar.',
  );
  return `https://wa.me/${number}?text=${text}`;
}

/** WhatsApp de suporte para o admin da loja (painel). */
export function supportWhatsappHref(storeName?: string, storeSlug?: string) {
  const parts = [
    'Olá! Preciso de suporte no painel da minha loja.',
    storeName ? `Loja: ${storeName}` : null,
    storeSlug ? `Slug: ${storeSlug}` : null,
  ].filter(Boolean);
  return whatsappHref(parts.join('\n'));
}
