'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';

/**
 * "Avise-me quando chegar" num produto (ou opção) esgotado. A loja manda um
 * e-mail só, quando o estoque voltar.
 */
export function AviseMe({
  storeSlug,
  productId,
  variantId,
  emailInicial,
}: {
  storeSlug: string;
  productId: string;
  variantId?: string | null;
  emailInicial?: string;
}) {
  const [email, setEmail] = useState(emailInicial || '');
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro('');
    try {
      await api('/storefront/avise-me', {
        method: 'POST',
        storeSlug,
        body: {
          productId,
          ...(variantId ? { variantId } : {}),
          email: email.trim(),
        },
      });
      setEnviado(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível registrar');
    } finally {
      setOcupado(false);
    }
  }

  if (enviado) {
    return (
      <p className="mt-4 border border-[#bfe3c8] bg-[#f0fbf3] px-3 py-2.5 text-sm text-[#166534]">
        Pronto! Vamos te avisar em <strong>{email.trim()}</strong> assim que
        chegar.
      </p>
    );
  }

  return (
    <form
      onSubmit={enviar}
      className="mt-4 border border-line bg-[#fafafa] px-3 py-3"
    >
      <p className="text-sm font-semibold">Avise-me quando chegar</p>
      <p className="mt-0.5 text-xs text-muted">
        Deixe seu e-mail e receba um aviso quando voltar ao estoque.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="avise-me-email">
          Seu e-mail
        </label>
        <input
          id="avise-me-email"
          type="email"
          required
          className="field min-w-0 flex-1"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <button className="btn btn-accent shrink-0" disabled={ocupado}>
          {ocupado ? 'Enviando...' : 'Avisar-me'}
        </button>
      </div>
      {erro ? <p className="mt-1.5 text-xs text-accent">{erro}</p> : null}
    </form>
  );
}
