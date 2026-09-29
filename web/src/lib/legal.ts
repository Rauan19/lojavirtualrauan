import { BRAND } from '@/lib/brand';
import { CONTACT } from '@/lib/contact';

/**
 * Dados da empresa dona da plataforma, usados nos Termos de Uso, na Política
 * de Privacidade e no rodapé.
 *
 * Vêm do ambiente para o repositório não carregar CNPJ nem endereço. Defina
 * em `.env.local` (e no .env de produção) assim que a empresa estiver aberta:
 *   NEXT_PUBLIC_LEGAL_RAZAO_SOCIAL="Vendira Tecnologia Ltda"
 *   NEXT_PUBLIC_LEGAL_CNPJ="00.000.000/0001-00"
 *   NEXT_PUBLIC_LEGAL_ENDERECO="Rua X, 100, Bairro, Cidade/UF, CEP 00000-000"
 *   NEXT_PUBLIC_LEGAL_CIDADE_FORO="São Paulo/SP"
 *   NEXT_PUBLIC_LEGAL_EMAIL_PRIVACIDADE="privacidade@seudominio.com.br"
 *
 * Campo vazio simplesmente não aparece: melhor faltar uma linha do que
 * publicar um CNPJ de exemplo.
 */
export const LEGAL = {
  marca: BRAND.name,
  razaoSocial: process.env.NEXT_PUBLIC_LEGAL_RAZAO_SOCIAL?.trim() || '',
  cnpj: process.env.NEXT_PUBLIC_LEGAL_CNPJ?.trim() || '',
  endereco: process.env.NEXT_PUBLIC_LEGAL_ENDERECO?.trim() || '',
  cidadeForo: process.env.NEXT_PUBLIC_LEGAL_CIDADE_FORO?.trim() || '',
  /** Contato do encarregado (LGPD art. 41). Sem um próprio, usa o de contato. */
  emailPrivacidade:
    process.env.NEXT_PUBLIC_LEGAL_EMAIL_PRIVACIDADE?.trim() || CONTACT.email,
  emailContato: CONTACT.email,
};

/**
 * Versão dos textos. Mudou o texto de forma relevante? Troque a data aqui E em
 * api/src/common/legal.ts — é ela que fica gravada no aceite de cada loja.
 */
export const TERMS_VERSION = '2026-09-29';
export const PRIVACY_VERSION = '2026-09-29';

/** "Vendira Tecnologia Ltda, CNPJ 00.000.000/0001-00" ou só a marca. */
export function empresaIdentificada(): string {
  const partes = [LEGAL.razaoSocial || LEGAL.marca];
  if (LEGAL.cnpj) partes.push(`CNPJ ${LEGAL.cnpj}`);
  return partes.join(', ');
}

export function dataVersao(v: string): string {
  const [a, m, d] = v.split('-');
  return `${d}/${m}/${a}`;
}
