'use client';

import { FormEvent, Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

function RedefinirSenhaForm() {
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
      const res = await api<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: { token, password },
      });
      setDone(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f5f5] px-4 py-8">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm border border-line bg-white p-5 md:p-6"
      >
        <Link href="/login" className="text-xs font-medium text-muted hover:text-ink">
          ← Login
        </Link>
        <h1 className="mt-3 text-xl font-bold">Nova senha</h1>
        <p className="mt-1 text-sm text-muted">Painel admin / super admin.</p>
        {!token ? (
          <p className="mt-4 text-sm text-accent">Link inválido.</p>
        ) : (
          <>
            {error ? (
              <p className="mt-3 border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-accent">
                {error}
              </p>
            ) : null}
            {done ? (
              <p className="mt-3 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {done}{' '}
                <Link href="/login" className="font-semibold underline">
                  Entrar
                </Link>
              </p>
            ) : (
              <>
                <div className="mt-4">
                  <label className="label">Nova senha</label>
                  <input
                    className="field"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                    autoComplete="new-password"
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-accent mt-4 w-full"
                  disabled={busy}
                >
                  {busy ? 'Salvando...' : 'Salvar senha'}
                </button>
              </>
            )}
          </>
        )}
      </form>
    </main>
  );
}

/**
 * useSearchParams() precisa de um boundary de Suspense, senão o Next
 * não consegue pré-renderizar a rota e o build quebra.
 */
export default function AdminRedefinirSenhaPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f5f5f5] px-4 py-8">
          <p className="text-sm text-muted">Carregando...</p>
        </main>
      }
    >
      <RedefinirSenhaForm />
    </Suspense>
  );
}
