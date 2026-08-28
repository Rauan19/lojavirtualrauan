'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { PasswordField, StoreAuthShell } from '@/components/StoreAuthShell';
import { api } from '@/lib/api';

export default function RedefinirSenhaClientePage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const token = useMemo(() => search.get('token') || '', [search]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDone('');
    try {
      const res = await api<{ message: string }>('/storefront/auth/reset-password', {
        method: 'POST',
        storeSlug: params.slug,
        body: { token, password },
      });
      setDone(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <StoreAuthShell
      slug={params.slug}
      title="Nova senha"
      subtitle="Escolha uma senha nova para sua conta nesta loja."
    >
      {!token ? (
        <p className="text-sm text-accent">Link inválido. Peça um novo e-mail.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          {error ? (
            <p className="border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-accent">
              {error}
            </p>
          ) : null}
          {done ? (
            <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {done}{' '}
              <Link
                href={`/loja/${params.slug}/conta/entrar`}
                className="font-semibold underline"
              >
                Entrar
              </Link>
            </p>
          ) : (
            <>
              <PasswordField
                label="Nova senha"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                minLength={6}
                required
              />
              <button type="submit" className="btn btn-accent w-full" disabled={busy}>
                {busy ? 'Salvando...' : 'Salvar senha'}
              </button>
            </>
          )}
        </form>
      )}
    </StoreAuthShell>
  );
}
