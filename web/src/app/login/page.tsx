'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { api, AuthUser } from '@/lib/api';
import { getToken, getUser, saveSession } from '@/lib/auth';
import { clearAllCustomerSessions } from '@/lib/customer-auth';

type LoginResposta =
  | { accessToken: string; user: AuthUser; ativarDoisFatores?: true }
  | { segundaEtapa: true; desafio: string };

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
  /** Passe da senha quando a conta tem verificação em duas etapas. */
  const [desafio, setDesafio] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [usarRecuperacao, setUsarRecuperacao] = useState(false);

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
      const data = await api<LoginResposta>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if ('segundaEtapa' in data) {
        setDesafio(data.desafio);
        setCodigo('');
        return;
      }
      entrar(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setLoading(false);
    }
  }

  function entrar(data: {
    accessToken: string;
    user: AuthUser;
    ativarDoisFatores?: true;
  }) {
    const dest = redirectForUser(data.user);
    if (!dest) {
      throw new Error('Este login é só para admin da loja ou da plataforma.');
    }
    clearAllCustomerSessions();
    saveSession(data.accessToken, data.user);
    // Super Admin sem verificação em duas etapas: primeiro ativa
    router.replace(data.ativarDoisFatores ? '/super/seguranca' : dest);
  }

  async function onSubmitCodigo(e: FormEvent) {
    e.preventDefault();
    if (!desafio) return;
    setLoading(true);
    setError('');
    try {
      const data = await api<{
        accessToken: string;
        user: AuthUser;
        codigosRecuperacaoRestantes?: number;
      }>('/auth/2fa/login', {
        method: 'POST',
        body: { desafio, codigo },
      });
      entrar(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Código incorreto';
      // Passe vencido: volta para a senha
      if (/tempo para digitar|Entre com a senha/i.test(msg)) {
        setDesafio(null);
        setPassword('');
      }
      setError(msg);
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
      {desafio ? (
        <form onSubmit={onSubmitCodigo}>
          <h2 className="font-[family-name:var(--font-brand)] text-[1.7rem] font-800 leading-tight tracking-tight text-[#171a1f]">
            Verificação em duas etapas
          </h2>
          <p className="mt-1.5 text-[15px] text-[#4a5560]">
            {usarRecuperacao
              ? 'Digite um dos códigos de recuperação que você guardou ao ativar.'
              : 'Abra o app autenticador no celular e digite o código de 6 dígitos da Vendira.'}
          </p>
          <div className="mt-7 space-y-4">
            <div>
              <label className="label" htmlFor="codigo-2fa">
                {usarRecuperacao ? 'Código de recuperação' : 'Código do app'}
              </label>
              <input
                id="codigo-2fa"
                className="field h-12 text-center font-mono text-xl tracking-[0.3em]"
                value={codigo}
                onChange={(e) =>
                  setCodigo(
                    usarRecuperacao
                      ? e.target.value.toUpperCase().slice(0, 11)
                      : e.target.value.replace(/\D/g, '').slice(0, 6),
                  )
                }
                inputMode={usarRecuperacao ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                placeholder={usarRecuperacao ? 'XXXXX-XXXXX' : '000000'}
                autoFocus
                required
              />
            </div>

            {error ? (
              <p className="border border-accent/25 bg-accent/5 px-3 py-2 text-[13px] leading-snug text-accent">
                {error}
              </p>
            ) : null}

            <button
              className="btn btn-accent btn-block py-3.5 text-[15px]"
              disabled={
                loading ||
                (usarRecuperacao ? codigo.length < 10 : codigo.length !== 6)
              }
            >
              {loading ? 'Conferindo...' : 'Confirmar'}
            </button>

            <div className="flex flex-wrap justify-between gap-2 text-[13px]">
              <button
                type="button"
                className="font-medium text-[#4a5560] underline-offset-2 hover:text-accent hover:underline"
                onClick={() => {
                  setUsarRecuperacao((v) => !v);
                  setCodigo('');
                  setError('');
                }}
              >
                {usarRecuperacao
                  ? 'Usar o código do app'
                  : 'Perdi o celular: usar código de recuperação'}
              </button>
              <button
                type="button"
                className="font-medium text-[#4a5560] underline-offset-2 hover:text-accent hover:underline"
                onClick={() => {
                  setDesafio(null);
                  setCodigo('');
                  setError('');
                }}
              >
                Voltar
              </button>
            </div>
          </div>
        </form>
      ) : (
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
      )}
    </AuthShell>
  );
}
