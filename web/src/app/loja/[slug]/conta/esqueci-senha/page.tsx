'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { StoreAuthShell } from '@/components/StoreAuthShell';
import { api } from '@/lib/api';

export default function EsqueciSenhaPage() {
  const params = useParams<{ slug: string }>();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDone('');
    try {
      const res = await api<{ message: string }>('/storefront/auth/forgot-password', {
        method: 'POST',
        storeSlug: params.slug,
        body: { email },
      });
      setDone(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <StoreAuthShell
      slug={params.slug}
      title="Esqueci a senha"
      subtitle="Enviamos um link se o e-mail existir nesta loja."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {error ? (
          <p className="border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-accent">
            {error}
          </p>
        ) : null}
        {done ? (
          <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {done}
          </p>
        ) : null}
        <div>
          <label className="label">E-mail</label>
          <input
            className="field"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <button type="submit" className="btn btn-accent w-full" disabled={busy}>
          {busy ? 'Enviando...' : 'Enviar link'}
        </button>
        <p className="text-center text-sm text-muted">
          <Link
            href={`/loja/${params.slug}/conta/entrar`}
            className="font-semibold text-ink underline-offset-2 hover:underline"
          >
            Voltar ao login
          </Link>
        </p>
      </form>
    </StoreAuthShell>
  );
}
