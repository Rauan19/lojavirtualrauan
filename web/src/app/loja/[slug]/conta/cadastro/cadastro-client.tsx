'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCustomer } from '@/components/CustomerProvider';
import { PasswordField, StoreAuthShell } from '@/components/StoreAuthShell';

function resolveAfterLogin(slug: string, raw: string | null) {
  const home = `/loja/${slug}`;
  if (!raw) return home;
  if (raw.includes('/checkout') || raw.includes('/conta/pedidos')) return raw;
  return home;
}

export default function ContaCadastroPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { register, customer, loading } = useCustomer();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [touchedConfirm, setTouchedConfirm] = useState(false);

  const next = resolveAfterLogin(params.slug, search.get('next'));

  const mismatch = useMemo(
    () =>
      touchedConfirm &&
      passwordConfirm.length > 0 &&
      password !== passwordConfirm,
    [password, passwordConfirm, touchedConfirm],
  );

  useEffect(() => {
    if (!loading && customer) {
      router.replace(next);
    }
  }, [loading, customer, router, next]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouchedConfirm(true);
    if (password !== passwordConfirm) {
      setError('As senhas precisam ser iguais');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await register({
        name,
        email,
        password,
        phone: phone || undefined,
      });
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <StoreAuthShell
      slug={params.slug}
      title="Criar sua conta"
      subtitle="Cadastre-se para comprar mais rápido e guardar seus endereços."
    >
      <form onSubmit={onSubmit} className="space-y-2.5">
        {error ? (
          <p className="border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-accent">
            {error}
          </p>
        ) : null}

        <div>
          <label className="label">Nome completo</label>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como no documento"
            autoComplete="name"
            required
          />
        </div>

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

        <div>
          <label className="label">WhatsApp / telefone</label>
          <input
            className="field"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(00) 00000-0000"
            autoComplete="tel"
          />
        </div>

        <PasswordField
          label="Senha"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={6}
          required
          hint="Mínimo de 6 caracteres"
        />

        <PasswordField
          label="Digite a senha novamente"
          value={passwordConfirm}
          onChange={(v) => {
            setPasswordConfirm(v);
            setTouchedConfirm(true);
          }}
          autoComplete="new-password"
          minLength={6}
          required
          error={mismatch ? 'As senhas não são iguais' : undefined}
        />

        <button
          type="submit"
          className="btn btn-accent mt-1 w-full"
          disabled={busy || mismatch}
        >
          {busy ? 'Criando conta...' : 'Criar conta'}
        </button>

        <p className="pt-0.5 text-center text-sm text-muted">
          Já tem conta?{' '}
          <Link
            href={`/loja/${params.slug}/conta/entrar?next=${encodeURIComponent(next)}`}
            className="font-semibold text-ink underline-offset-2 hover:underline"
          >
            Entrar
          </Link>
        </p>
      </form>
    </StoreAuthShell>
  );
}
