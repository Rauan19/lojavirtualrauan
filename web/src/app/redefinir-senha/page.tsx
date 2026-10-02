'use client';

import { FormEvent, Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

function RedefinirSenhaForm() {
  const search = useSearchParams();
  const token = useMemo(() => search.get('token') || '', [search]);
  // Convite da equipe usa o mesmo link: a pessoa cria a primeira senha
  const convite = search.get('convite') === '1';
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
    <main className="auth-stage flex min-h-screen items-start justify-center px-4 py-10 md:items-center">
      <form
        onSubmit={onSubmit}
        className="auth-card w-full max-w-md rounded-[22px] bg-white p-6 shadow-[0_30px_70px_-30px_rgba(4,24,29,0.65)] sm:p-9"
      >
        <Link href="/login" className="text-xs font-medium text-muted hover:text-ink">
          ← Login
        </Link>
        <h1 className="mt-4 font-[family-name:var(--font-brand)] text-[1.7rem] font-800 leading-tight tracking-tight">
          {convite ? 'Criar sua senha' : 'Nova senha'}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {convite
            ? 'Você foi chamado para a equipe da loja. Escolha a senha para entrar no painel.'
            : 'Painel admin / super admin.'}
        </p>
        {!token ? (
          <p className="mt-4 text-sm text-accent">Link inválido.</p>
        ) : (
          <>
            {error ? (
              <p role="alert" className="mt-3 border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-accent">
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
                  className="btn btn-accent mt-5 w-full"
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
        <main className="auth-stage flex min-h-screen items-start justify-center px-4 py-10 md:items-center">
          <p className="text-sm text-white/80">Carregando…</p>
        </main>
      }
    >
      <RedefinirSenhaForm />
    </Suspense>
  );
}
