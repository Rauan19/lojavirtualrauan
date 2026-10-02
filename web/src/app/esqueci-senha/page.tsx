'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function AdminEsqueciSenhaPage() {
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
      const res = await api<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
      setDone(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar');
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
          ← Voltar
        </Link>
        <h1 className="mt-4 font-[family-name:var(--font-brand)] text-[1.7rem] font-800 leading-tight tracking-tight">Esqueci a senha</h1>
        <p className="mt-1 text-sm text-muted">
          Enviamos um link se o e-mail existir no painel.
        </p>
        {error ? (
          <p role="alert" className="mt-3 border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-accent">
            {error}
          </p>
        ) : null}
        {done ? (
          <p className="mt-3 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {done}
          </p>
        ) : null}
        <div className="mt-4">
          <label className="label">E-mail</label>
          <input
            className="field"
            type="email"
            autoComplete="email"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-accent mt-5 w-full" disabled={busy}>
          {busy ? 'Enviando…' : 'Enviar link'}
        </button>
      </form>
    </main>
  );
}
