'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden className="mt-0.5 shrink-0">
      <circle cx="10" cy="10" r="9" stroke="var(--accent)" strokeWidth="1.4" />
      <path d="M6 10.2l2.4 2.4L14 7" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
    <main className="grid min-h-screen md:grid-cols-2">
      <section className="hidden flex-col justify-between bg-[#171a1f] p-10 text-white md:flex lg:p-14">
        <div>
          <Link href="/" className="inline-block">
            <BrandLogo height={30} onDark />
          </Link>
          <h1 className="mt-12 max-w-[14ch] font-[family-name:var(--font-brand)] text-[2.4rem] font-800 leading-[1.08] lg:text-[2.75rem]">
            Sua loja, sempre aberta.
          </h1>
          <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-white/70">
            Entre e acompanhe pedidos, produtos e vendas em um painel só,
            enquanto sua vitrine continua vendendo sozinha.
          </p>
          <ul className="mt-10 space-y-3.5">
            {perks.map((perk) => (
              <li key={perk} className="flex items-start gap-2.5 text-[14px] leading-snug text-white/85">
                <CheckIcon />
                {perk}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-white/45">
          Ainda não tem loja?{' '}
          <Link href="/criar-conta" className="font-semibold text-white underline-offset-4 hover:underline">
            Crie a sua agora mesmo
          </Link>
        </p>
      </section>

      <section className="flex items-center justify-center bg-[#f7f8fa] px-4 py-10 md:bg-white md:px-10">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <Link href="/" className="inline-block md:hidden">
            <BrandLogo height={26} />
          </Link>

          <h2 className="mt-6 font-[family-name:var(--font-brand)] text-[1.6rem] font-800 leading-tight text-[#171a1f] md:mt-0">
            Entrar
          </h2>
          <p className="mt-1.5 text-sm text-muted">Acesse o painel da sua loja.</p>

          <div className="mt-7 space-y-4">
            <div>
              <label className="label">E-mail</label>
              <input
                className="field"
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
                  className="text-[11px] font-medium text-muted underline-offset-2 hover:text-accent hover:underline"
                >
                  Esqueci a senha
                </Link>
              </div>
              <div className="relative">
                <input
                  className="field pr-9"
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
                  className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted hover:text-ink"
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

            <button className="btn btn-accent btn-block py-2.5 text-[13px]" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-muted md:hidden">
            Ainda não tem loja?{' '}
            <Link href="/criar-conta" className="font-semibold text-accent underline-offset-2 hover:underline">
              Criar minha loja
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
