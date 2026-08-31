'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { api, AuthUser } from '@/lib/api';
import { getToken, getUser, saveSession } from '@/lib/auth';
import { clearAllCustomerSessions } from '@/lib/customer-auth';

function redirectForUser(user: AuthUser): string {
  if (user.role === 'SUPER_ADMIN') return '/super';
  if (user.role === 'STORE_ADMIN' && user.store?.slug) return '/admin';
  return '';
}

const perks = [
  'Painel completo de pedidos, produtos e clientes',
  'Pagamento direto na sua conta',
  'Nota fiscal (NFC-e) emitida automaticamente',
];

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden>
        <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 17L17 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (token && user) {
      const dest = redirectForUser(user);
      if (dest) {
        router.replace(dest);
        return;
      }
    }
    setReady(true);
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api<{ accessToken: string; user: AuthUser }>(
        '/auth/login',
        { method: 'POST', body: { email, password } },
      );
      clearAllCustomerSessions();
      saveSession(data.accessToken, data.user);
      const dest = redirectForUser(data.user);
      if (!dest) {
        throw new Error(
          'Este login é só para admin da loja ou da plataforma.',
        );
      }
      router.replace(dest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted">
        Carregando...
      </main>
    );
  }

  return (
    <AuthShell
      headline="Sua loja, sempre aberta."
      subhead="Entre e acompanhe pedidos, produtos e vendas em um painel só, enquanto sua vitrine continua vendendo sozinha."
      perks={perks}
      footNote={
        <>
          Ainda não tem loja?{' '}
          <Link
            href="/criar-conta"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            Crie a sua agora mesmo
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <h2 className="font-[family-name:var(--font-brand)] text-[1.7rem] font-800 leading-tight tracking-tight text-[#171a1f]">
          Entrar
        </h2>
        <p className="mt-1.5 text-[15px] text-[#4a5560]">
          Acesse o painel da sua loja.
        </p>

        <div className="mt-7 space-y-4">
          <div>
            <label className="label">E-mail</label>
            <input
              className="field h-11"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="voce@email.com"
              required
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label className="label">Senha</label>
              <Link
                href="/esqueci-senha"
                className="text-[11px] font-medium text-[#4a5560] underline-offset-2 hover:text-accent hover:underline"
              >
                Esqueci a senha
              </Link>
            </div>
            <div className="relative">
              <input
                className="field h-11 pr-10"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[#8a92a0] hover:text-ink"
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          {error ? (
            <p className="border border-accent/25 bg-accent/5 px-3 py-2 text-[13px] leading-snug text-accent">
              {error}
            </p>
          ) : null}

          <button
            className="btn btn-accent btn-bag btn-block py-3.5 text-[15px]"
            style={{ '--bag-bg': '#fff' } as React.CSSProperties}
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
