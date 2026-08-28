'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
import { api, AuthUser } from '@/lib/api';
import { getToken, getUser, saveSession } from '@/lib/auth';
import { clearAllCustomerSessions } from '@/lib/customer-auth';
import { formatPhoneBr } from '@/lib/contact';
import { formatCep, isCepLengthValid, lookupViaCep } from '@/lib/cep';

type Step = 1 | 2 | 3;
type DocType = 'CPF' | 'CNPJ';

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: 'Loja e login' },
  { id: 2, label: 'Documento' },
  { id: 3, label: 'Endereço' },
];

const perks = [
  '14 dias grátis, sem cartão de crédito',
  'Vitrine e painel prontos pra usar',
  'Comece a vender ainda hoje',
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden className="mt-0.5 shrink-0">
      <circle cx="10" cy="10" r="9" stroke="var(--accent)" strokeWidth="1.4" />
      <path d="M6 10.2l2.4 2.4L14 7" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatDoc(value: string, type: DocType) {
  const d = value.replace(/\D/g, '').slice(0, type === 'CNPJ' ? 14 : 11);
  if (type === 'CPF') {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export default function CriarContaPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>(1);

  // Etapa 1 — loja e login
  const [storeName, setStoreName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Etapa 2 — documento e contato
  const [docType, setDocType] = useState<DocType>('CPF');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');

  // Etapa 3 — endereço
  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (token && user?.role === 'STORE_ADMIN') {
      router.replace('/admin');
      return;
    }
    setReady(true);
  }, [router]);

  async function onCepBlur(raw: string) {
    setCepError('');
    if (!isCepLengthValid(raw)) return;
    setCepLoading(true);
    try {
      const found = await lookupViaCep(raw);
      if (!found) {
        setCepError('CEP não encontrado. Confira ou preencha manualmente.');
        return;
      }
      setZipCode(found.zipCode);
      setStreet(found.street);
      setNeighborhood(found.neighborhood);
      setCity(found.city);
      setState(found.state);
    } catch {
      setCepError('Falha ao buscar o CEP. Preencha manualmente.');
    } finally {
      setCepLoading(false);
    }
  }

  function validateStep(current: Step): string {
    if (current === 1) {
      if (!storeName.trim() || !adminName.trim() || !email.trim()) {
        return 'Preencha todos os campos.';
      }
      if (password.length < 6) return 'A senha precisa de pelo menos 6 caracteres.';
    }
    if (current === 2) {
      const digits = document.replace(/\D/g, '');
      if (docType === 'CPF' && digits.length !== 11) return 'CPF incompleto.';
      if (docType === 'CNPJ' && digits.length !== 14) return 'CNPJ incompleto.';
      const phoneDigits = phone.replace(/\D/g, '');
      if (phoneDigits.length < 10) return 'Telefone incompleto.';
    }
    return '';
  }

  function goNext() {
    const msg = validateStep(step);
    if (msg) {
      setError(msg);
      return;
    }
    setError('');
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  }

  function goBack() {
    setError('');
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!zipCode || !street || !number.trim() || !neighborhood || !city || !state) {
      setError('Complete o endereço.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api<{ accessToken: string; user: AuthUser; slug: string }>(
        '/stores/signup',
        {
          method: 'POST',
          body: {
            storeName,
            adminName,
            adminEmail: email,
            adminPassword: password,
            sellerDocType: docType,
            sellerDocument: document.replace(/\D/g, ''),
            phone: phone.replace(/\D/g, ''),
            zipCode: zipCode.replace(/\D/g, ''),
            street,
            number,
            complement: complement || undefined,
            neighborhood,
            city,
            state,
          },
        },
      );
      clearAllCustomerSessions();
      saveSession(data.accessToken, data.user);
      router.replace('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar a loja');
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
          <h1 className="mt-12 max-w-[15ch] font-[family-name:var(--font-brand)] text-[2.4rem] font-800 leading-[1.08] lg:text-[2.75rem]">
            Crie sua loja em minutos
          </h1>
          <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-white/70">
            Cadastra produto, testa o checkout e decide o plano depois, lá
            dentro do painel, quando quiser.
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
          Já tem loja?{' '}
          <Link href="/login" className="font-semibold text-white underline-offset-4 hover:underline">
            Entrar na sua conta
          </Link>
        </p>
      </section>

      <section className="flex items-center justify-center bg-[#f7f8fa] px-4 py-10 md:bg-white md:px-10">
        <div className="w-full max-w-sm">
          <Link href="/" className="inline-block md:hidden">
            <BrandLogo height={26} />
          </Link>

          {/* Indicador de etapas */}
          <ol className="mt-6 mb-6 flex items-center gap-2 text-[11px] font-medium text-muted md:mt-0">
            {STEPS.map((s, i) => (
              <li key={s.id} className="flex flex-1 items-center gap-2 last:flex-none">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] transition-colors ${
                    step === s.id
                      ? 'border-accent bg-accent text-white'
                      : step > s.id
                        ? 'border-ink bg-ink text-white'
                        : 'border-line text-muted'
                  }`}
                >
                  {step > s.id ? '✓' : s.id}
                </span>
                <span className={`hidden sm:inline ${step === s.id ? 'text-ink' : ''}`}>{s.label}</span>
                {i < STEPS.length - 1 ? (
                  <span
                    className={`h-px flex-1 transition-colors ${step > s.id ? 'bg-ink' : 'bg-line'}`}
                    aria-hidden
                  />
                ) : null}
              </li>
            ))}
          </ol>

          <form onSubmit={onSubmit}>
            {step === 1 ? (
              <div className="space-y-3">
                <div>
                  <label className="label">Nome da loja</label>
                  <input
                    className="field"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Ex.: Camisetas do João"
                    autoComplete="organization"
                    required
                  />
                </div>
                <div>
                  <label className="label">Seu nome</label>
                  <input
                    className="field"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
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
                    autoComplete="email"
                    required
                  />
                </div>
                <div>
                  <label className="label">Senha</label>
                  <input
                    className="field"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                  <p className="mt-1 text-[11px] text-muted">Mínimo 6 caracteres.</p>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  Precisamos do CPF ou CNPJ pra emitir nota fiscal e receber
                  seus pagamentos.
                </p>
                <div>
                  <label className="label">Tipo de documento</label>
                  <div className="flex gap-2">
                    {(['CPF', 'CNPJ'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setDocType(type);
                          setDocument('');
                        }}
                        className={`flex-1 border px-3 py-2 text-sm font-semibold transition-colors ${
                          docType === type
                            ? 'border-ink bg-ink text-white'
                            : 'border-line text-ink hover:border-ink/40'
                        }`}
                      >
                        {type === 'CPF' ? 'CPF (pessoa física)' : 'CNPJ (empresa)'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">{docType}</label>
                  <input
                    className="field"
                    value={document}
                    onChange={(e) => setDocument(formatDoc(e.target.value, docType))}
                    placeholder={docType === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
                    inputMode="numeric"
                    autoComplete="off"
                    required
                  />
                </div>
                <div>
                  <label className="label">Telefone / WhatsApp</label>
                  <input
                    className="field"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneBr(e.target.value))}
                    placeholder="(11) 98888-7777"
                    inputMode="numeric"
                    autoComplete="tel"
                    required
                  />
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  Endereço de onde você despacha os pedidos. Usamos também
                  pra calcular o frete.
                </p>
                <div>
                  <label className="label">CEP</label>
                  <input
                    className="field"
                    value={zipCode}
                    onChange={(e) => setZipCode(formatCep(e.target.value))}
                    onBlur={(e) => onCepBlur(e.target.value)}
                    placeholder="00000-000"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    required
                  />
                  {cepLoading ? (
                    <p className="mt-1 text-[11px] text-muted">Buscando endereço...</p>
                  ) : null}
                  {cepError ? (
                    <p className="mt-1 text-[11px] text-accent">{cepError}</p>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="label">Rua</label>
                    <input
                      className="field"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      autoComplete="address-line1"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Número</label>
                    <input
                      className="field"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Complemento (opcional)</label>
                  <input
                    className="field"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    placeholder="Sala, bloco, referência..."
                    autoComplete="address-line2"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="label">Bairro</label>
                    <input
                      className="field"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">UF</label>
                    <input
                      className="field"
                      value={state}
                      onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                      maxLength={2}
                      autoComplete="address-level1"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Cidade</label>
                  <input
                    className="field"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    autoComplete="address-level2"
                    required
                  />
                </div>
              </div>
            ) : null}

            {error ? <p className="mt-3 text-sm text-accent">{error}</p> : null}

            <div className="mt-5 flex items-center gap-2">
              {step > 1 ? (
                <button type="button" onClick={goBack} className="btn btn-ghost">
                  Voltar
                </button>
              ) : null}
              {step < 3 ? (
                <button type="button" onClick={goNext} className="btn btn-accent flex-1">
                  Continuar
                </button>
              ) : (
                <button className="btn btn-accent flex-1" disabled={loading}>
                  {loading ? 'Criando sua loja...' : 'Criar minha loja grátis'}
                </button>
              )}
            </div>

            <p className="mt-4 text-center text-sm text-muted md:hidden">
              Já tem loja?{' '}
              <Link href="/login" className="font-semibold text-accent underline-offset-2 hover:underline">
                Entrar
              </Link>
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
