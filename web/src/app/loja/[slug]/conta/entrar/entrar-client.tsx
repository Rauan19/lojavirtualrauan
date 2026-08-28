'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCustomer } from '@/components/CustomerProvider';
import { PasswordField, StoreAuthShell } from '@/components/StoreAuthShell';

function resolveAfterLogin(slug: string, raw: string | null) {
  const conta = `/loja/${slug}/conta`;
  if (!raw) return conta;
  // Mantém só fluxos em andamento (compra / pedidos)
  if (raw.includes('/checkout') || raw.includes('/conta/pedidos')) return raw;
  return conta;
}

export default function ContaEntrarPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { login, customer, loading } = useCustomer();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = resolveAfterLogin(params.slug, search.get('next'));

  useEffect(() => {
    if (!loading && customer) {
      router.replace(next);
    }
  }, [loading, customer, router, next]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <StoreAuthShell
      slug={params.slug}
      title="Bem-vindo de volta"
      subtitle="Login do comprador nesta loja (não é o painel do dono)."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {error ? (
          <p className="border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-accent">
            {error}
          </p>
        ) : null}

        <div>
          <label className="label">E-mail</label>
          <input
            className="field"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            autoComplete="email"
            required
          />
        </div>

        <PasswordField
          label="Senha"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          minLength={6}
          required
        />

        <button
          type="submit"
          className="btn btn-accent w-full"
          disabled={busy}
        >
          {busy ? 'Entrando...' : 'Entrar'}
        </button>

        <p className="text-center text-sm text-muted">
          <Link
            href={`/loja/${params.slug}/conta/esqueci-senha`}
            className="underline-offset-2 hover:underline"
          >
            Esqueci a senha
          </Link>
        </p>

        <p className="pt-1 text-center text-sm text-muted">
          Ainda não tem conta?{' '}
          <Link
            href={`/loja/${params.slug}/conta/cadastro?next=${encodeURIComponent(next)}`}
            className="font-semibold text-ink underline-offset-2 hover:underline"
          >
            Criar conta
          </Link>
        </p>
      </form>
    </StoreAuthShell>
  );
}
