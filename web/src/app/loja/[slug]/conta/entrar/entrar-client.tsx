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
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? (
          <p className="border border-accent/25 bg-accent/5 px-3 py-2.5 text-sm leading-snug text-accent">
            {error}
          </p>
        ) : null}

        <div>
          <label className="label">E-mail</label>
          <input
            className="field h-11 text-[15px]"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            autoComplete="email"
            required
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="label">Senha</label>
            <Link
              href={`/loja/${params.slug}/conta/esqueci-senha`}
              className="text-[11px] font-semibold text-muted underline-offset-2 transition hover:text-ink hover:underline"
            >
              Esqueci a senha
            </Link>
          </div>
          <PasswordField
            label=""
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            minLength={6}
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-accent h-11 w-full text-[15px]"
          disabled={busy}
        >
          {busy ? 'Entrando...' : 'Entrar'}
        </button>

        <div className="flex items-center gap-3 pt-1">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
            ou
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <Link
          href={`/loja/${params.slug}/conta/cadastro?next=${encodeURIComponent(next)}`}
          className="btn btn-ghost h-11 w-full text-[15px]"
        >
          Criar minha conta
        </Link>
      </form>
    </StoreAuthShell>
  );
}
