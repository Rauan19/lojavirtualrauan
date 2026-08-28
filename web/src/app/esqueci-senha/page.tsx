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
    <main className="flex min-h-screen items-center justify-center bg-[#f5f5f5] px-4 py-8">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm border border-line bg-white p-5 md:p-6"
      >
        <Link href="/login" className="text-xs font-medium text-muted hover:text-ink">
          ← Voltar
        </Link>
        <h1 className="mt-3 text-xl font-bold">Esqueci a senha</h1>
        <p className="mt-1 text-sm text-muted">
          Enviamos um link se o e-mail existir no painel.
        </p>
        {error ? (
          <p className="mt-3 border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-accent">
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-accent mt-4 w-full" disabled={busy}>
          {busy ? 'Enviando...' : 'Enviar link'}
        </button>
      </form>
    </main>
  );
}
