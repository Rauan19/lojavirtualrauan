'use client';

import { FormEvent, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { api, mediaUrl } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { formatPhoneBr } from '@/lib/contact';
import {
  FRETE_CARRIER_OPTIONS,
  asCarrierIds,
} from '@/lib/frete-carriers';
import { STORE_CARD_RATIOS, STORE_FONTS } from '@/lib/store-theme';

type Store = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  customDomain?: string | null;
  status?: string;
  planName?: string;
  planDueAt?: string | null;
  monthlyFee?: string | number | null;
  daysLeft?: number | null;
  planState?: 'ok' | 'expiring' | 'expired' | 'none';
  mpPublicKey?: string | null;
  mpAccessTokenSet?: boolean;
  mpAccessTokenHint?: string | null;
  mpPublicKeyHint?: string | null;
  checkoutMode?: string;
  mpWebhookUrl?: string | null;
  freteModo: string;
  freteValorFixo?: string | null;
  freteGratisAcima?: string | null;
  freteTokenSet?: boolean;
  freteCepOrigem?: string | null;
  freteRuaOrigem?: string | null;
  freteNumeroOrigem?: string | null;
  freteComplementoOrigem?: string | null;
  freteBairroOrigem?: string | null;
  freteCidadeOrigem?: string | null;
  freteUfOrigem?: string | null;
  freteSandbox?: boolean;
  freteEmailContato?: string | null;
  freteEtiquetaAuto?: boolean;
  /** Slugs liberados no checkout. [] = todas. */
  freteTransportadoras?: string[] | null;
  marqueeEnabled?: boolean;
  marqueeImages?: string[] | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
  storeType?: string | null;
  storeFont?: string | null;
  storeCardRatio?: string | null;
  analyticsGaId?: string | null;
  analyticsPixelId?: string | null;
  sellerDocType?: 'CPF' | 'CNPJ' | null;
  sellerDocument?: string | null;
  sellerLegalName?: string | null;
  sellerTradeName?: string | null;
  sellerIe?: string | null;
  sellerIm?: string | null;
  sellerPhone?: string | null;
  sellerEmail?: string | null;
  sellerZipCode?: string | null;
  sellerStreet?: string | null;
  sellerNumber?: string | null;
  sellerComplement?: string | null;
  sellerNeighborhood?: string | null;
  sellerCity?: string | null;
  sellerState?: string | null;
  termsHtml?: string | null;
  privacyHtml?: string | null;
  returnsHtml?: string | null;
  nfeEnabled?: boolean;
  nfeEnvironment?: string | null;
  nfeApiTokenSet?: boolean;
  nfeSeries?: string | null;
  nfeCscId?: string | null;
  nfeCscTokenSet?: boolean;
};

function asImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function hasOriginAddress(store: Store | null): boolean {
  if (!store) return false;
  const cep = (store.freteCepOrigem || '').replace(/\D/g, '');
  return (
    cep.length === 8 &&
    Boolean(store.freteRuaOrigem?.trim()) &&
    Boolean(store.freteNumeroOrigem?.trim()) &&
    Boolean(store.freteBairroOrigem?.trim()) &&
    Boolean(store.freteCidadeOrigem?.trim()) &&
    Boolean(store.freteUfOrigem?.trim()) &&
    (store.freteUfOrigem || '').trim().length === 2
  );
}

function SettingsPanel({
  id,
  title,
  summary,
  badge,
  open,
  onToggle,
  children,
}: {
  id?: string;
  title: string;
  summary: string;
  badge?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="overflow-hidden border border-line bg-white"
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-[#fafafa]"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-0.5 text-xs text-muted">{summary}</p>
        </div>
        {badge ? <div className="shrink-0 pt-0.5">{badge}</div> : null}
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-line text-sm font-bold text-muted"
          aria-hidden
        >
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? (
        <div className="border-t border-line px-4 py-4">{children}</div>
      ) : null}
    </section>
  );
}

function StatusPill({
  ok,
  okLabel,
  badLabel,
}: {
  ok: boolean;
  okLabel: string;
  badLabel: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        ok
          ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
          : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
      }`}
    >
      {ok ? okLabel : badLabel}
    </span>
  );
}

export default function AdminSettingsPage() {
  const [store, setStore] = useState<Store | null>(null);
  const [mpAccessToken, setMpAccessToken] = useState('');
  const [mpPublicKey, setMpPublicKey] = useState('');
  const [freteToken, setFreteToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploadingMarquee, setUploadingMarquee] = useState(false);
  const [originModalOpen, setOriginModalOpen] = useState(false);
  const [savingOrigin, setSavingOrigin] = useState(false);
  const [openSection, setOpenSection] = useState<
    | 'branding'
    | 'marquee'
    | 'shipping'
    | 'payments'
    | 'plan'
    | 'profile'
    | 'policies'
    | 'nfe'
    | null
  >(null);
  const [nfeApiToken, setNfeApiToken] = useState('');
  const [nfeCscToken, setNfeCscToken] = useState('');
  const [meHelpOpen, setMeHelpOpen] = useState(false);

  function toggleSection(
    id:
      | 'branding'
      | 'marquee'
      | 'shipping'
      | 'payments'
      | 'plan'
      | 'profile'
      | 'policies'
      | 'nfe',
  ) {
    setOpenSection((prev) => (prev === id ? null : id));
  }

  const auth = () => {
    const user = getUser();
    return { token: getToken(), storeSlug: user?.store?.slug };
  };

  useEffect(() => {
    const { token, storeSlug } = auth();
    if (!token) return;
    api<Store>('/stores/me', { token, storeSlug })
      .then((s) => {
        const next = {
          ...s,
          sellerPhone: s.sellerPhone ? formatPhoneBr(s.sellerPhone) : s.sellerPhone,
          marqueeEnabled: s.marqueeEnabled !== false,
          marqueeImages: asImages(s.marqueeImages),
          freteTransportadoras: asCarrierIds(s.freteTransportadoras),
        };
        setStore(next);
        setMpPublicKey(s.mpPublicKey || '');
        if (!hasOriginAddress(next)) {
          setOriginModalOpen(true);
          setOpenSection('shipping');
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro'));
  }, []);

  useEffect(() => {
    if (!originModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [originModalOpen]);

  async function patchBranding(body: Record<string, unknown>) {
    const { token, storeSlug } = auth();
    if (!store || !token) return null;
    return api<Store>('/stores/me/branding', {
      method: 'PATCH',
      token,
      storeSlug,
      body,
    });
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    setError('');
    setMessage('');
    try {
      const { token, storeSlug } = auth();
      if (!token) return;
      const updated = await api<Store>('/stores/me/profile', {
        method: 'PATCH',
        token,
        storeSlug,
        body: {
          // Ramo da loja fica em Identidade visual: mandar daqui desfazia a
          // escolha de estilo toda vez que o lojista salvasse o endereço.
          sellerDocType: store.sellerDocType || null,
          sellerDocument: store.sellerDocument || null,
          sellerLegalName: store.sellerLegalName || null,
          sellerTradeName: store.sellerTradeName || null,
          sellerIe: store.sellerIe || null,
          sellerIm: store.sellerIm || null,
          sellerPhone: store.sellerPhone || null,
          sellerEmail: store.sellerEmail || null,
          sellerZipCode: store.sellerZipCode || null,
          sellerStreet: store.sellerStreet || null,
          sellerNumber: store.sellerNumber || null,
          sellerComplement: store.sellerComplement || null,
          sellerNeighborhood: store.sellerNeighborhood || null,
          sellerCity: store.sellerCity || null,
          sellerState: store.sellerState || null,
        },
      });
      setStore({
        ...updated,
        sellerPhone: updated.sellerPhone
          ? formatPhoneBr(updated.sellerPhone)
          : updated.sellerPhone,
        marqueeImages: asImages(updated.marqueeImages),
      });
      setMessage('Perfil da loja salvo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil');
    }
  }

  async function savePolicies(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    setError('');
    setMessage('');
    try {
      const { token, storeSlug } = auth();
      if (!token) return;
      const updated = await api<Store>('/stores/me/policies', {
        method: 'PATCH',
        token,
        storeSlug,
        body: {
          termsHtml: store.termsHtml || null,
          privacyHtml: store.privacyHtml || null,
          returnsHtml: store.returnsHtml || null,
        },
      });
      setStore({
        ...updated,
        marqueeImages: asImages(updated.marqueeImages),
      });
      setMessage('Políticas salvas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar políticas');
    }
  }

  async function saveNfe(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    setError('');
    setMessage('');
    try {
      const { token, storeSlug } = auth();
      if (!token) return;
      const body: Record<string, unknown> = {
        nfeEnabled: !!store.nfeEnabled,
        nfeEnvironment: store.nfeEnvironment || 'homologacao',
        nfeSeries: store.nfeSeries || undefined,
        nfeCscId: store.nfeCscId || null,
      };
      if (nfeApiToken.trim()) body.nfeApiToken = nfeApiToken.trim();
      if (nfeCscToken.trim()) body.nfeCscToken = nfeCscToken.trim();
      const updated = await api<Store>('/stores/me/nfe', {
        method: 'PATCH',
        token,
        storeSlug,
        body,
      });
      setStore({
        ...updated,
        marqueeImages: asImages(updated.marqueeImages),
      });
      setNfeApiToken('');
      setNfeCscToken('');
      setMessage('Configuração de NFC-e salva');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar NFC-e');
    }
  }

  async function saveBranding(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    try {
      const updated = await patchBranding({
        name: store.name,
        logoUrl: store.logoUrl,
        primaryColor: store.primaryColor,
        secondaryColor: store.secondaryColor,
        accentColor: store.accentColor,
        customDomain: store.customDomain || undefined,
        storeType: store.storeType || undefined,
        storeFont: store.storeFont ?? '',
        storeCardRatio: store.storeCardRatio ?? '',
        analyticsGaId: store.analyticsGaId ?? '',
        analyticsPixelId: store.analyticsPixelId ?? '',
        marqueeEnabled: store.marqueeEnabled !== false,
        marqueeImages: asImages(store.marqueeImages),
        instagramUrl: store.instagramUrl || '',
        facebookUrl: store.facebookUrl || '',
        tiktokUrl: store.tiktokUrl || '',
      });
      if (updated) {
        setStore({
          ...updated,
          marqueeImages: asImages(updated.marqueeImages),
        });
      }
      setMessage('Identidade salva');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    }
  }

  async function uploadLogo(file: File) {
    const { token, storeSlug } = auth();
    if (!token || !storeSlug || !store) return;
    setError('');
    setMessage('');
    const formData = new FormData();
    formData.append('file', file);
    const uploaded = await api<{ path: string }>('/admin/uploads', {
      method: 'POST',
      token,
      storeSlug,
      formData,
    });
    const updated = await patchBranding({
      name: store.name,
      logoUrl: uploaded.path,
      primaryColor: store.primaryColor,
      secondaryColor: store.secondaryColor,
      accentColor: store.accentColor,
      customDomain: store.customDomain || undefined,
      marqueeEnabled: store.marqueeEnabled !== false,
      marqueeImages: asImages(store.marqueeImages),
    });
    if (updated) {
      setStore({
        ...updated,
        marqueeImages: asImages(updated.marqueeImages),
      });
    }
    setMessage('Logo atualizada na vitrine');
  }

  async function uploadMarquee(file: File) {
    const { token, storeSlug } = auth();
    if (!token || !storeSlug || !store) return;
    const current = asImages(store.marqueeImages);
    if (current.length >= 12) {
      setError('Máximo de 12 fotos no marquee');
      return;
    }
    setUploadingMarquee(true);
    setError('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploaded = await api<{ path: string }>('/admin/uploads', {
        method: 'POST',
        token,
        storeSlug,
        formData,
      });
      const next = [...current, uploaded.path];
      const updated = await patchBranding({
        name: store.name,
        logoUrl: store.logoUrl,
        primaryColor: store.primaryColor,
        secondaryColor: store.secondaryColor,
        accentColor: store.accentColor,
        customDomain: store.customDomain || undefined,
        marqueeEnabled: true,
        marqueeImages: next,
      });
      if (updated) {
        setStore({
          ...updated,
          marqueeEnabled: true,
          marqueeImages: asImages(updated.marqueeImages),
        });
      }
      setMessage('Foto adicionada ao marquee');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no upload');
    } finally {
      setUploadingMarquee(false);
    }
  }

  async function removeMarqueeImage(path: string) {
    if (!store) return;
    const next = asImages(store.marqueeImages).filter((p) => p !== path);
    try {
      const updated = await patchBranding({
        name: store.name,
        logoUrl: store.logoUrl,
        primaryColor: store.primaryColor,
        secondaryColor: store.secondaryColor,
        accentColor: store.accentColor,
        customDomain: store.customDomain || undefined,
        marqueeEnabled: store.marqueeEnabled !== false,
        marqueeImages: next,
      });
      if (updated) {
        setStore({
          ...updated,
          marqueeImages: asImages(updated.marqueeImages),
        });
      }
      setMessage('Foto removida');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    }
  }

  async function saveMp(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    const { token, storeSlug } = auth();
    setError('');
    setMessage('');
    try {
      if (!store.mpAccessTokenSet && !mpAccessToken.trim()) {
        setError('Cole o Access Token do Mercado Pago para salvar.');
        return;
      }
      if (!mpPublicKey.trim() && !store.mpPublicKey) {
        setError('Cole a Public Key do Mercado Pago para salvar.');
        return;
      }
      const updated = await api<Store>('/stores/me/mercadopago', {
        method: 'PATCH',
        token,
        storeSlug,
        body: {
          ...(mpAccessToken.trim()
            ? { mpAccessToken: mpAccessToken.trim() }
            : {}),
          ...(mpPublicKey.trim() ? { mpPublicKey: mpPublicKey.trim() } : {}),
          checkoutMode: store.checkoutMode || 'personalized',
        },
      });
      setStore({
        ...store,
        ...updated,
        marqueeImages: asImages(updated.marqueeImages ?? store.marqueeImages),
      });
      setMpAccessToken('');
      setMessage(
        updated.mpAccessTokenHint
          ? `Salvo! Token gravado (${updated.mpAccessTokenHint}). O campo fica vazio de propósito — o segredo não aparece de novo.`
          : 'Mercado Pago salvo',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    }
  }

  async function testMp() {
    if (!store) return;
    const { token, storeSlug } = auth();
    setError('');
    setMessage('');
    try {
      const res = await api<{
        ok: boolean;
        message: string;
        nickname?: string | null;
        email?: string | null;
        mpUserId?: number | string | null;
        tip?: string;
      }>('/stores/me/mercadopago/test', {
        method: 'POST',
        token,
        storeSlug,
      });
      setMessage(
        `${res.message}${res.nickname ? ` · conta: ${res.nickname}` : ''}${
          res.email ? ` (${res.email})` : ''
        }. ${res.tip || ''}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao testar');
    }
  }

  async function lookupOriginCep(digits: string) {
    if (!store || digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data.erro) return;
      setStore((prev) =>
        prev
          ? {
              ...prev,
              freteRuaOrigem: data.logradouro || prev.freteRuaOrigem || '',
              freteBairroOrigem: data.bairro || prev.freteBairroOrigem || '',
              freteCidadeOrigem: data.localidade || prev.freteCidadeOrigem || '',
              freteUfOrigem: data.uf || prev.freteUfOrigem || '',
            }
          : prev,
      );
    } catch {
      /* ViaCEP offline — admin preenche manual */
    }
  }

  async function saveShipping(e?: FormEvent) {
    e?.preventDefault();
    if (!store) return false;
    const { token, storeSlug } = auth();
    if (!hasOriginAddress(store)) {
      setError(
        'Cadastre o endereço completo de origem (CEP, rua, número, bairro, cidade e UF). O frete usa esse CEP + o CEP do cliente.',
      );
      setOriginModalOpen(true);
      return false;
    }
    try {
      const updated = await api<Store>('/stores/me/shipping', {
        method: 'PATCH',
        token,
        storeSlug,
        body: {
          freteModo: store.freteModo || 'manual',
          freteValorFixo: store.freteValorFixo
            ? Number(store.freteValorFixo)
            : undefined,
          freteGratisAcima:
            store.freteGratisAcima && Number(store.freteGratisAcima) > 0
              ? Number(store.freteGratisAcima)
              : null,
          freteToken: freteToken.trim() || undefined,
          freteCepOrigem: store.freteCepOrigem || null,
          freteRuaOrigem: store.freteRuaOrigem || null,
          freteNumeroOrigem: store.freteNumeroOrigem || null,
          freteComplementoOrigem: store.freteComplementoOrigem || null,
          freteBairroOrigem: store.freteBairroOrigem || null,
          freteCidadeOrigem: store.freteCidadeOrigem || null,
          freteUfOrigem: store.freteUfOrigem || null,
          freteSandbox: store.freteSandbox === true,
          freteEmailContato: store.freteEmailContato || null,
          freteEtiquetaAuto: store.freteEtiquetaAuto === true,
          freteTransportadoras: asCarrierIds(store.freteTransportadoras),
        },
      });
      setStore({
        ...store,
        ...updated,
        freteTransportadoras: asCarrierIds(
          updated.freteTransportadoras ?? store.freteTransportadoras,
        ),
        marqueeImages: asImages(updated.marqueeImages ?? store.marqueeImages),
      });
      setFreteToken('');
      setMessage('Frete e endereço de origem salvos');
      setError('');
      setOriginModalOpen(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
      return false;
    }
  }

  async function saveOriginFromModal(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    setSavingOrigin(true);
    setError('');
    try {
      await saveShipping();
    } finally {
      setSavingOrigin(false);
    }
  }

  if (!store) return <p className="text-muted">Carregando...</p>;

  const logo = mediaUrl(store.logoUrl);
  const marquee = asImages(store.marqueeImages);
  const originReady = hasOriginAddress(store);

  function setOriginField<K extends keyof Store>(key: K, value: Store[K]) {
    setStore((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return (
    <div className="admin-page">
      {originModalOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="origin-modal-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden border border-line bg-white shadow-xl sm:rounded-md">
            <div className="border-b border-line px-4 py-3">
              <h2 id="origin-modal-title" className="text-base font-bold">
                Cadastre o endereço da loja primeiro
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                O frete no checkout é calculado entre o <strong>CEP de origem</strong>{' '}
                (de onde você envia) e o <strong>CEP do cliente</strong>. Sem o
                seu endereço, a cotação não funciona direito.
              </p>
            </div>

            <form
              onSubmit={saveOriginFromModal}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="grid grid-cols-1 gap-3 overflow-y-auto px-4 py-4 sm:grid-cols-2">
                <div>
                  <label className="label">CEP de origem</label>
                  <input
                    className="field"
                    value={store.freteCepOrigem ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const digits = raw.replace(/\D/g, '').slice(0, 8);
                      setOriginField('freteCepOrigem', raw);
                      void lookupOriginCep(digits);
                    }}
                    placeholder="00000-000"
                    inputMode="numeric"
                    required
                    autoFocus
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    Digite o CEP — rua, bairro, cidade e UF preenchem sozinhos.
                  </p>
                </div>
                <div>
                  <label className="label">Número</label>
                  <input
                    className="field"
                    value={store.freteNumeroOrigem ?? ''}
                    onChange={(e) =>
                      setOriginField('freteNumeroOrigem', e.target.value)
                    }
                    placeholder="123"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Rua / logradouro</label>
                  <input
                    className="field"
                    value={store.freteRuaOrigem ?? ''}
                    onChange={(e) =>
                      setOriginField('freteRuaOrigem', e.target.value)
                    }
                    required
                  />
                </div>
                <div>
                  <label className="label">Complemento</label>
                  <input
                    className="field"
                    value={store.freteComplementoOrigem ?? ''}
                    onChange={(e) =>
                      setOriginField('freteComplementoOrigem', e.target.value)
                    }
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <label className="label">Bairro</label>
                  <input
                    className="field"
                    value={store.freteBairroOrigem ?? ''}
                    onChange={(e) =>
                      setOriginField('freteBairroOrigem', e.target.value)
                    }
                    required
                  />
                </div>
                <div>
                  <label className="label">Cidade</label>
                  <input
                    className="field"
                    value={store.freteCidadeOrigem ?? ''}
                    onChange={(e) =>
                      setOriginField('freteCidadeOrigem', e.target.value)
                    }
                    required
                  />
                </div>
                <div>
                  <label className="label">UF</label>
                  <input
                    className="field"
                    value={store.freteUfOrigem ?? ''}
                    onChange={(e) =>
                      setOriginField(
                        'freteUfOrigem',
                        e.target.value.toUpperCase().slice(0, 2),
                      )
                    }
                    placeholder="SP"
                    maxLength={2}
                    required
                  />
                </div>
                {error ? (
                  <p className="text-sm text-accent sm:col-span-2">{error}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 border-t border-line bg-[#fafafa] px-4 py-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="btn btn-ghost order-2 sm:order-1"
                  onClick={() => {
                    setOriginModalOpen(false);
                    setOpenSection('shipping');
                    requestAnimationFrame(() => {
                      document
                        .getElementById('origem-frete')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                  }}
                >
                  Preencher na página
                </button>
                <button
                  type="submit"
                  className="btn btn-accent order-1 sm:order-2"
                  disabled={savingOrigin}
                >
                  {savingOrigin ? 'Salvando...' : 'Salvar endereço de origem'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div>
        <h1>Configurações da loja</h1>
        <p className="text-sm text-muted">
          Abra só o que precisa ajustar ·{' '}
          <strong>/loja/{store.slug}</strong>
        </p>
      </div>

      {!originReady ? (
        <button
          type="button"
          className="w-full border border-amber-300 bg-amber-50 px-3 py-3 text-left text-sm text-amber-950"
          onClick={() => setOriginModalOpen(true)}
        >
          <p className="font-semibold">Endereço de origem pendente</p>
          <p className="mt-1 text-xs text-amber-900/90">
            Clique para cadastrar. Sem CEP da loja o frete no checkout não
            calcula com o CEP do cliente.
          </p>
        </button>
      ) : null}

      {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}
      {error && !originModalOpen ? (
        <p className="text-sm text-accent">{error}</p>
      ) : null}

      <div className="flex flex-col gap-2">
      <SettingsPanel
        title="Identidade visual"
        summary="Nome, logo, cores e domínio"
        open={openSection === 'branding'}
        onToggle={() => toggleSection('branding')}
      >
      <form onSubmit={saveBranding} className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label">Nome</label>
          <input
            className="field"
            value={store.name}
            onChange={(e) => setStore({ ...store, name: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Domínio próprio</label>
          <input
            className="field"
            placeholder="minhaloja.com.br"
            value={store.customDomain || ''}
            onChange={(e) => setStore({ ...store, customDomain: e.target.value })}
          />
          <p className="mt-1 text-[11px] text-muted">
            Aponte o DNS (A/CNAME) para este app. Sem www na gravação — o sistema
            normaliza. Em produção configure PLATFORM_HOSTS e CORS_ORIGINS.
          </p>
        </div>
        <div>
          <label className="label">Cor primária</label>
          <input
            className="field"
            type="color"
            value={store.primaryColor}
            onChange={(e) => setStore({ ...store, primaryColor: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Cor de destaque</label>
          <input
            className="field"
            type="color"
            value={store.accentColor}
            onChange={(e) => setStore({ ...store, accentColor: e.target.value })}
          />
        </div>
        <div className="md:col-span-2 border-t border-line pt-3">
          <p className="text-[13px] font-semibold">Estilo da vitrine</p>
          <p className="mt-0.5 text-[11px] text-muted">
            Deixe em “Automático” para seguir o ramo da loja. Trocar o ramo
            muda a cara da vitrine sozinho.
          </p>
        </div>
        <div>
          <label className="label">Ramo da loja</label>
          <select
            className="field"
            value={store.storeType || 'GENERAL'}
            onChange={(e) => setStore({ ...store, storeType: e.target.value })}
          >
            <option value="GENERAL">Geral / variedades</option>
            <option value="FASHION">Moda e roupas</option>
            <option value="SHOES">Calçados</option>
            <option value="ELECTRONICS">Eletrônicos e acessórios</option>
            <option value="CUSTOM">Personalizado</option>
          </select>
          <p className="mt-1 text-[11px] text-muted">
            Define as sugestões de categoria e o estilo padrão da vitrine.
          </p>
        </div>
        <div>
          <label className="label">Formato da foto do produto</label>
          <select
            className="field"
            value={store.storeCardRatio || ''}
            onChange={(e) =>
              setStore({ ...store, storeCardRatio: e.target.value })
            }
          >
            <option value="">Automático (pelo ramo da loja)</option>
            {STORE_CARD_RATIOS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label} — {r.hint}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted">
            Vale para a vitrine, as prateleiras e a página do produto.
          </p>
        </div>
        <div>
          <label className="label">Fonte da loja</label>
          <select
            className="field"
            value={store.storeFont || ''}
            onChange={(e) => setStore({ ...store, storeFont: e.target.value })}
          >
            <option value="">Automático (pelo ramo da loja)</option>
            {STORE_FONTS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label} — {f.hint}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <a
            href={`/loja/${store.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost w-full"
          >
            Ver na vitrine
          </a>
        </div>

        <div className="md:col-span-2 border-t border-line pt-3">
          <p className="text-[13px] font-semibold">Medição de audiência</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            Opcional. Preenchendo qualquer um dos dois, a vitrine passa a pedir
            consentimento de cookies ao visitante, como manda a LGPD — e os
            scripts só carregam depois do aceite. Deixando em branco, a loja usa
            só cookie essencial e nenhum aviso aparece.
          </p>
        </div>
        <div>
          <label className="label">Google Analytics (opcional)</label>
          <input
            className="field"
            placeholder="G-XXXXXXXXXX"
            value={store.analyticsGaId || ''}
            onChange={(e) => setStore({ ...store, analyticsGaId: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Meta Pixel (opcional)</label>
          <input
            className="field"
            placeholder="123456789012345"
            value={store.analyticsPixelId || ''}
            onChange={(e) =>
              setStore({ ...store, analyticsPixelId: e.target.value })
            }
          />
        </div>

        <div className="md:col-span-2">
          <label className="label">Logo da loja</label>
          <p className="mb-1 text-xs text-muted">
            PNG com fundo transparente (recomendado). Tamanho ideal:{' '}
            <strong>800 × 240 px</strong> (horizontal). Aceita até 5 MB.
          </p>
          <input
            className="field"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadLogo(f).catch((err) => setError(err instanceof Error ? err.message : 'Erro'));
            }}
          />
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Logo" className="mt-2 h-14 object-contain" />
          ) : (
            <p className="mt-1 text-xs text-muted">Nenhuma logo ainda.</p>
          )}
        </div>
        <div className="md:col-span-2">
          <p className="label mb-1.5">Redes sociais (aparecem no rodapé da loja)</p>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              className="field"
              placeholder="Instagram (link completo)"
              value={store.instagramUrl || ''}
              onChange={(e) => setStore({ ...store, instagramUrl: e.target.value })}
            />
            <input
              className="field"
              placeholder="Facebook (link completo)"
              value={store.facebookUrl || ''}
              onChange={(e) => setStore({ ...store, facebookUrl: e.target.value })}
            />
            <input
              className="field"
              placeholder="TikTok (link completo)"
              value={store.tiktokUrl || ''}
              onChange={(e) => setStore({ ...store, tiktokUrl: e.target.value })}
            />
          </div>
        </div>
        <button className="btn md:col-span-2">Salvar identidade</button>
      </form>
      </SettingsPanel>

      <SettingsPanel
        title="Carrossel da vitrine"
        summary="Banners em faixa no topo da loja"
        badge={
          <StatusPill
            ok={store.marqueeEnabled !== false && marquee.length > 0}
            okLabel={`${marquee.length} foto${marquee.length === 1 ? '' : 's'}`}
            badLabel={store.marqueeEnabled === false ? 'Off' : 'Sem fotos'}
          />
        }
        open={openSection === 'marquee'}
        onToggle={() => toggleSection('marquee')}
      >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-xs text-muted">
            Banners grandes passando no topo — lookbook, promoção, coleção.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={store.marqueeEnabled !== false}
              onChange={async (e) => {
                const enabled = e.target.checked;
                setStore({ ...store, marqueeEnabled: enabled });
                try {
                  await patchBranding({
                    name: store.name,
                    logoUrl: store.logoUrl,
                    primaryColor: store.primaryColor,
                    secondaryColor: store.secondaryColor,
                    accentColor: store.accentColor,
                    customDomain: store.customDomain || undefined,
                    marqueeEnabled: enabled,
                    marqueeImages: marquee,
                  });
                  setMessage(enabled ? 'Marquee ativado' : 'Marquee desativado');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Erro');
                }
              }}
            />
            Exibir na vitrine
          </label>
        </div>

        <div className="rounded border border-line bg-[#f7f8fa] px-3 py-2 text-xs text-muted">
          Ideal <strong>1920 × 800 px</strong> · JPG/PNG até 5 MB · 3 a 12 banners
        </div>

        <div>
          <label className="label">Adicionar foto</label>
          <input
            className="field"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploadingMarquee || marquee.length >= 12}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) uploadMarquee(f).catch(() => undefined);
            }}
          />
          {uploadingMarquee ? (
            <p className="mt-1 text-xs text-muted">Enviando...</p>
          ) : null}
        </div>

        {marquee.length === 0 ? (
          <p className="text-sm text-muted">
            Nenhuma foto ainda. Sem fotos próprias, a vitrine usa imagens dos produtos.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {marquee.map((path) => {
              const src = mediaUrl(path);
              return (
                <div key={path} className="relative aspect-[21/9] overflow-hidden border border-line bg-[#eee]">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  ) : null}
                  <button
                    type="button"
                    className="absolute right-1 top-1 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white"
                    onClick={() => removeMarqueeImage(path)}
                  >
                    Remover
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </SettingsPanel>

      <SettingsPanel
        id="origem-frete"
        title="Frete e endereço de origem"
        summary="CEP da loja + cotação no checkout do cliente"
        badge={
          <StatusPill
            ok={originReady}
            okLabel="Origem ok"
            badLabel="Falta endereço"
          />
        }
        open={openSection === 'shipping'}
        onToggle={() => toggleSection('shipping')}
      >
      <form
        onSubmit={(e) => {
          void saveShipping(e);
        }}
        className="grid gap-3 md:grid-cols-2"
      >
        <div className="md:col-span-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-semibold">Endereço de origem — obrigatório</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
            Frete = CEP da sua loja (origem) ↔ CEP do cliente no checkout.
          </p>
        </div>

        <h3 className="text-xs font-bold uppercase tracking-wide text-muted md:col-span-2">
          De onde o produto sai
        </h3>

        <div>
          <label className="label">CEP de origem</label>
          <input
            className="field"
            value={store.freteCepOrigem ?? ''}
            onChange={(e) => {
              const raw = e.target.value;
              const digits = raw.replace(/\D/g, '').slice(0, 8);
              setStore({ ...store, freteCepOrigem: raw });
              void lookupOriginCep(digits);
            }}
            placeholder="00000-000"
            inputMode="numeric"
            required
          />
        </div>
        <div>
          <label className="label">Número</label>
          <input
            className="field"
            value={store.freteNumeroOrigem ?? ''}
            onChange={(e) =>
              setStore({ ...store, freteNumeroOrigem: e.target.value })
            }
            placeholder="123"
            required
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">Rua / logradouro</label>
          <input
            className="field"
            value={store.freteRuaOrigem ?? ''}
            onChange={(e) =>
              setStore({ ...store, freteRuaOrigem: e.target.value })
            }
            required
          />
        </div>
        <div>
          <label className="label">Complemento</label>
          <input
            className="field"
            value={store.freteComplementoOrigem ?? ''}
            onChange={(e) =>
              setStore({ ...store, freteComplementoOrigem: e.target.value })
            }
            placeholder="Opcional"
          />
        </div>
        <div>
          <label className="label">Bairro</label>
          <input
            className="field"
            value={store.freteBairroOrigem ?? ''}
            onChange={(e) =>
              setStore({ ...store, freteBairroOrigem: e.target.value })
            }
            required
          />
        </div>
        <div>
          <label className="label">Cidade</label>
          <input
            className="field"
            value={store.freteCidadeOrigem ?? ''}
            onChange={(e) =>
              setStore({ ...store, freteCidadeOrigem: e.target.value })
            }
            required
          />
        </div>
        <div>
          <label className="label">UF</label>
          <input
            className="field"
            value={store.freteUfOrigem ?? ''}
            onChange={(e) =>
              setStore({
                ...store,
                freteUfOrigem: e.target.value.toUpperCase().slice(0, 2),
              })
            }
            placeholder="SP"
            maxLength={2}
            required
          />
        </div>

        <h3 className="text-xs font-bold uppercase tracking-wide text-muted md:col-span-2">
          Como calcular o frete
        </h3>

        <div className="md:col-span-2">
          <label className="label">Provedor de frete</label>
          <select
            className="field"
            value={store.freteModo || 'manual'}
            onChange={(e) => {
              const mode = e.target.value;
              setStore({ ...store, freteModo: mode });
              if (mode === 'melhor_envio') setMeHelpOpen(true);
            }}
          >
            <option value="manual">Tabela própria (valor fixo)</option>
            <option value="gratis">Sempre grátis</option>
            <option value="melhor_envio">Melhor Envio</option>
            <option value="frenet">Frenet</option>
            <option value="superfrete">SuperFrete</option>
          </select>
          {store.freteModo === 'melhor_envio' ? (
            <p className="mt-1 text-[11px] text-muted">
              Precisa de conta + token no Melhor Envio. Use o botão “Ver passo a
              passo” abaixo.
            </p>
          ) : null}
        </div>

        {store.freteModo === 'manual' || store.freteModo === 'gratis' ? (
          <>
            {store.freteModo === 'manual' ? (
              <div>
                <label className="label">Valor base PAC (R$)</label>
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  value={store.freteValorFixo ?? '25'}
                  onChange={(e) =>
                    setStore({ ...store, freteValorFixo: e.target.value })
                  }
                />
              </div>
            ) : null}
            <div className={store.freteModo === 'gratis' ? 'md:col-span-2' : ''}>
              <label className="label">Frete grátis acima de (R$)</label>
              <input
                className="field"
                type="number"
                step="0.01"
                value={store.freteGratisAcima ?? ''}
                onChange={(e) =>
                  setStore({ ...store, freteGratisAcima: e.target.value })
                }
                placeholder="Opcional"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label">
                Token da API
                {store.freteTokenSet ? (
                  <span className="ml-1 font-normal text-[var(--ok)]">
                    (já configurado)
                  </span>
                ) : null}
              </label>
              <input
                className="field"
                type="password"
                value={freteToken}
                onChange={(e) => setFreteToken(e.target.value)}
                placeholder={
                  store.freteTokenSet
                    ? 'Deixe em branco para manter'
                    : store.freteModo === 'melhor_envio'
                      ? 'Cole o token do Melhor Envio'
                      : 'Cole o token'
                }
                required={!store.freteTokenSet}
              />
              {store.freteModo === 'melhor_envio' ? (
                <p className="mt-0.5 text-[11px] text-muted">
                  Token gerado no app/conta Melhor Envio (Integrações → Área
                  Dev.)
                </p>
              ) : null}
            </div>
            {store.freteModo === 'melhor_envio' ? (
              <>
                <div className="md:col-span-2 rounded border border-[#0B1F33]/15 bg-[#f4f8fc] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-ink">
                        Como integrar o Melhor Envio
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Cada loja usa a própria conta. Cole o token abaixo após
                        gerar no painel do Melhor Envio.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost py-1.5 text-xs"
                      onClick={() => setMeHelpOpen((v) => !v)}
                    >
                      {meHelpOpen ? 'Fechar guia' : 'Ver passo a passo'}
                    </button>
                  </div>

                  {meHelpOpen ? (
                    <div className="mt-3 space-y-3 border-t border-line pt-3 text-xs leading-relaxed text-ink">
                      <ol className="list-decimal space-y-2 pl-4">
                        <li>
                          Crie/entre na conta em{' '}
                          <a
                            href="https://melhorenvio.com.br"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold underline"
                          >
                            melhorenvio.com.br
                          </a>
                          .
                        </li>
                        <li>
                          Vá em <strong>Integrações → Área Dev.</strong> e
                          cadastre um aplicativo (ou use o token da sua conta).
                        </li>
                        <li>
                          Nas <strong>permissões</strong>, marque só o
                          necessário (lista abaixo). Não selecione tudo.
                        </li>
                        <li>
                          Copie o <strong>token / access token</strong> e cole
                          no campo Token da API nesta tela.
                        </li>
                        <li>
                          Informe o <strong>e-mail de contato</strong> (o ME
                          exige no User-Agent da cotação).
                        </li>
                        <li>
                          Em produção, use ambiente <strong>Produção</strong>.
                          Sandbox só para teste.
                        </li>
                        <li>
                          Token continua o mesmo. Em{' '}
                          <strong>Transportadoras no checkout</strong> (abaixo)
                          escolha o que o cliente vê — não precisa criar app no
                          Melhor Envio só pra isso.
                        </li>
                        <li>
                          (Opcional) Webhook de rastreio no app ME:{' '}
                          <code className="rounded bg-white px-1 text-[11px]">
                            /api/shipping/webhooks/melhor-envio
                          </code>{' '}
                          na URL pública da API — assim postagem/entrega atualizam
                          o pedido sozinhas.
                        </li>
                      </ol>

                      <div>
                        <p className="font-bold">Permissões para marcar</p>
                        <ul className="mt-1 columns-1 gap-x-6 space-y-0.5 sm:columns-2">
                          {[
                            'shipping-calculate',
                            'shipping-companies',
                            'ecommerce-shipping',
                            'cart-read',
                            'cart-write',
                            'shipping-checkout',
                            'shipping-generate',
                            'shipping-preview',
                            'shipping-print',
                            'shipping-tracking',
                            'shipping-cancel',
                            'orders-read',
                            'companies-read',
                            'users-read',
                            'products-read',
                            'webhooks-read',
                            'webhooks-write',
                          ].map((p) => (
                            <li key={p} className="font-mono text-[11px]">
                              ✓ {p}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <p className="font-bold text-muted">
                          Pode deixar desmarcado
                        </p>
                        <p className="mt-0.5 text-muted">
                          coupons-*, notifications-read, companies-write,
                          users-write, products-write, products-destroy,
                          purchases-read, transactions-read, shipping-share,
                          webhooks-delete, tdealer-webhook
                        </p>
                      </div>

                      <p>
                        <a
                          href="https://docs.melhorenvio.com.br"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold underline"
                        >
                          Documentação oficial Melhor Envio →
                        </a>
                      </p>
                    </div>
                  ) : null}
                </div>

                <div>
                  <label className="label">Ambiente Melhor Envio</label>
                  <select
                    className="field"
                    value={store.freteSandbox === true ? 'sandbox' : 'prod'}
                    onChange={(e) =>
                      setStore({
                        ...store,
                        freteSandbox: e.target.value === 'sandbox',
                      })
                    }
                  >
                    <option value="prod">Produção</option>
                    <option value="sandbox">Sandbox</option>
                  </select>
                </div>
                <div>
                  <label className="label">E-mail de contato</label>
                  <input
                    className="field"
                    type="email"
                    value={store.freteEmailContato ?? ''}
                    onChange={(e) =>
                      setStore({ ...store, freteEmailContato: e.target.value })
                    }
                    required
                  />
                  <p className="mt-0.5 text-[11px] text-muted">
                    Usado nas requisições ao Melhor Envio (obrigatório)
                  </p>
                </div>

                <div className="md:col-span-2 rounded border border-line bg-white p-3">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={store.freteEtiquetaAuto === true}
                      onChange={(e) =>
                        setStore({
                          ...store,
                          freteEtiquetaAuto: e.target.checked,
                        })
                      }
                    />
                    <span>
                      <span className="text-sm font-bold">
                        Gerar etiqueta automaticamente
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        Assim que o pagamento é aprovado, a etiqueta é comprada
                        e emitida no Melhor Envio, e o rastreio entra sozinho no
                        pedido.{' '}
                        <strong>
                          Isso gasta o saldo da sua conta do Melhor Envio.
                        </strong>{' '}
                        Desligado, você emite pelo botão em cada pedido.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="md:col-span-2 rounded border border-line bg-white p-3">
                  <p className="text-sm font-bold">
                    Transportadoras no checkout
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Marque só as que o cliente pode escolher. Nenhuma marcada =
                    mostra todas que o Melhor Envio cotar (token continua o
                    mesmo).
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {FRETE_CARRIER_OPTIONS.map((c) => {
                      const selected = asCarrierIds(
                        store.freteTransportadoras,
                      );
                      const checked = selected.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2 rounded border border-line px-2.5 py-2 text-sm hover:bg-[#fafafa]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? selected.filter((id) => id !== c.id)
                                : [...selected, c.id];
                              setStore({
                                ...store,
                                freteTransportadoras: next,
                              });
                            }}
                          />
                          <span>{c.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost py-1 text-xs"
                      onClick={() =>
                        setStore({
                          ...store,
                          freteTransportadoras: FRETE_CARRIER_OPTIONS.map(
                            (c) => c.id,
                          ),
                        })
                      }
                    >
                      Marcar todas
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost py-1 text-xs"
                      onClick={() =>
                        setStore({ ...store, freteTransportadoras: [] })
                      }
                    >
                      Limpar (mostrar todas da API)
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost py-1 text-xs"
                      onClick={() =>
                        setStore({
                          ...store,
                          freteTransportadoras: ['correios'],
                        })
                      }
                    >
                      Só Correios
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="md:col-span-1" />
            )}
            <div className="md:col-span-2">
              <label className="label">Frete grátis acima de (R$)</label>
              <input
                className="field"
                type="number"
                step="0.01"
                min="0"
                value={store.freteGratisAcima ?? ''}
                onChange={(e) =>
                  setStore({ ...store, freteGratisAcima: e.target.value })
                }
                placeholder="Opcional — deixe vazio para sempre cobrar"
              />
              <p className="mt-0.5 text-[11px] text-muted">
                {store.freteModo === 'melhor_envio' ||
                store.freteModo === 'frenet' ||
                store.freteModo === 'superfrete'
                  ? 'Se preencher, o checkout ainda cotará Correios/Jadlog etc. e zera o preço quando o carrinho passar desse valor. Vazio = sempre usa o preço da API.'
                  : 'Opcional. Vazio ou 0 = não aplica frete grátis por valor.'}
              </p>
            </div>
          </>
        )}

        <button className="btn md:col-span-2">Salvar frete e origem</button>
      </form>
      </SettingsPanel>

      <SettingsPanel
        title="Pagamento (Mercado Pago)"
        summary="Como o cliente paga o pedido na loja"
        badge={
          <StatusPill
            ok={Boolean(store.mpAccessTokenSet && store.mpPublicKey)}
            okLabel="Configurado"
            badLabel="Pendente"
          />
        }
        open={openSection === 'payments'}
        onToggle={() => toggleSection('payments')}
      >
      <form onSubmit={saveMp} className="grid gap-3 md:grid-cols-2">
        <p className="text-xs text-muted md:col-span-2">
          Credenciais da <strong>sua conta MP</strong> (teste <code>TEST-</code> ou
          produção <code>APP_USR-</code>). Sem isso o checkout não abre.
        </p>
        {!store.mpAccessTokenSet || !store.mpPublicKey ? (
          <p className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 md:col-span-2">
            Pagamento desligado até salvar Access Token e Public Key.
          </p>
        ) : null}

        {store.mpWebhookUrl ? (
          <div className="md:col-span-2 border border-line bg-[#f7f8fa] p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              Webhook (compra + reembolso)
            </p>
            <p className="mt-1 text-xs text-muted">
              O Mercado Pago avisa essa URL quando o cliente paga (Pix/cartão)
              ou quando o pagamento é reembolsado. Em produção use{' '}
              <code>PUBLIC_URL</code> HTTPS público no <code>.env</code> da API
              (localhost não recebe notificação).
            </p>
            <code className="mt-2 block break-all rounded border border-line bg-white px-2 py-2 text-[11px]">
              {store.mpWebhookUrl}
            </code>
            <button
              type="button"
              className="btn btn-ghost mt-2 text-xs"
              onClick={() => {
                void navigator.clipboard.writeText(store.mpWebhookUrl || '');
                setMessage('URL do webhook copiada');
              }}
            >
              Copiar URL
            </button>
          </div>
        ) : null}

        <div className="md:col-span-2">
          <label className="label">Modelo de checkout</label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label
              className={`cursor-pointer border px-3 py-3 text-sm ${
                (store.checkoutMode || 'personalized') !== 'pro'
                  ? 'border-[var(--store-accent,#e11d48)] bg-[#fff8f9]'
                  : 'border-line'
              }`}
            >
              <input
                type="radio"
                className="mr-2"
                name="checkoutMode"
                checked={(store.checkoutMode || 'personalized') !== 'pro'}
                onChange={() =>
                  setStore({ ...store, checkoutMode: 'personalized' })
                }
              />
              <span className="font-semibold">Brick na loja</span>
              <p className="mt-1 text-[11px] text-muted">
                Cartão e Pix na própria loja.
              </p>
            </label>
            <label
              className={`cursor-pointer border px-3 py-3 text-sm ${
                store.checkoutMode === 'pro'
                  ? 'border-[var(--store-accent,#e11d48)] bg-[#fff8f9]'
                  : 'border-line'
              }`}
            >
              <input
                type="radio"
                className="mr-2"
                name="checkoutMode"
                checked={store.checkoutMode === 'pro'}
                onChange={() => setStore({ ...store, checkoutMode: 'pro' })}
              />
              <span className="font-semibold">Checkout Pro</span>
              <p className="mt-1 text-[11px] text-muted">
                Redireciona para a página do Mercado Pago.
              </p>
            </label>
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="label">
            Access Token
            {store.mpAccessTokenSet ? (
              <span className="ml-1 font-normal text-[var(--ok)]">
                (salvo no servidor)
              </span>
            ) : null}
          </label>
          {store.mpAccessTokenSet && store.mpAccessTokenHint ? (
            <p className="mb-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
              Token atual: <code>{store.mpAccessTokenHint}</code>
              <span className="text-muted">
                {' '}
                — o campo abaixo fica vazio de propósito (segurança). Só cole de
                novo se for trocar.
              </span>
            </p>
          ) : null}
          <input
            className="field"
            type="password"
            value={mpAccessToken}
            onChange={(e) => setMpAccessToken(e.target.value)}
            placeholder={
              store.mpAccessTokenSet
                ? 'Cole um novo só se quiser substituir'
                : 'Cole o Access Token (teste ou produção)'
            }
            required={!store.mpAccessTokenSet}
            autoComplete="off"
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">Public Key</label>
          {store.mpPublicKeyHint ? (
            <p className="mb-1 text-[11px] text-muted">
              Salva: <code>{store.mpPublicKeyHint}</code>
            </p>
          ) : null}
          <input
            className="field"
            value={mpPublicKey}
            onChange={(e) => setMpPublicKey(e.target.value)}
            placeholder="Cole a Public Key (mesmo bloco do token)"
            required={!store.mpPublicKey && !mpPublicKey}
            autoComplete="off"
          />
          <p className="mt-1 text-[11px] text-muted">
            Public Key ≠ Access Token. Para testar: entre na conta{' '}
            <strong>real do vendedor</strong> (e-mail/CPF normal —{' '}
            <strong>nunca</strong> no TESTUSER) → Developers → Suas integrações
            → app → <strong>Credenciais de teste</strong> → copie as{' '}
            <strong>duas</strong> chaves desse mesmo bloco. Token de TESTUSER é
            rejeitado no “Testar credenciais”.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button type="submit" className="btn">
            Salvar pagamento
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void testMp()}
            disabled={!store.mpAccessTokenSet}
          >
            Testar credenciais no MP
          </button>
        </div>
      </form>
      </SettingsPanel>

      <SettingsPanel
        title="Perfil da loja / documento"
        summary="CPF/CNPJ e endereço do emitente"
        badge={
          <StatusPill
            ok={Boolean(store.sellerDocument && store.sellerDocType)}
            okLabel="Documento ok"
            badLabel="Documento pendente"
          />
        }
        open={openSection === 'profile'}
        onToggle={() => toggleSection('profile')}
      >
        <form onSubmit={saveProfile} className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2 rounded border border-line bg-[#fafafa] px-3 py-2 text-xs text-muted">
            Loja no modo <strong className="text-ink">Geral</strong> — vende
            qualquer tipo de produto. Tamanho, cor, ml, gramas etc. você define
            em cada produto (variações com estoque e preço).
          </div>
          <div>
            <label className="label">Tipo de documento</label>
            <select
              className="field"
              value={store.sellerDocType || ''}
              onChange={(e) =>
                setStore({
                  ...store,
                  sellerDocType: (e.target.value || null) as
                    | 'CPF'
                    | 'CNPJ'
                    | null,
                })
              }
            >
              <option value="">Selecione...</option>
              <option value="CPF">CPF — pessoa física</option>
              <option value="CNPJ">CNPJ — empresa</option>
            </select>
            <p className="mt-0.5 text-[11px] text-muted">
              Loja pequena pode operar como PF (CPF). Não precisa ser CNPJ.
            </p>
          </div>
          <div>
            <label className="label">
              {store.sellerDocType === 'CNPJ' ? 'CNPJ' : 'CPF'}
            </label>
            <input
              className="field"
              value={store.sellerDocument || ''}
              onChange={(e) =>
                setStore({ ...store, sellerDocument: e.target.value })
              }
              placeholder={
                store.sellerDocType === 'CNPJ'
                  ? '00.000.000/0000-00'
                  : '000.000.000-00'
              }
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label">Razão social / nome completo</label>
            <input
              className="field"
              value={store.sellerLegalName || ''}
              onChange={(e) =>
                setStore({ ...store, sellerLegalName: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">Nome fantasia (opcional)</label>
            <input
              className="field"
              value={store.sellerTradeName || ''}
              onChange={(e) =>
                setStore({ ...store, sellerTradeName: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">IE — inscrição estadual</label>
            <input
              className="field"
              value={store.sellerIe || ''}
              onChange={(e) =>
                setStore({ ...store, sellerIe: e.target.value })
              }
              placeholder="Opcional · ou ISENTO"
            />
          </div>
          <div>
            <label className="label">WhatsApp da loja / responsável</label>
            <input
              className="field"
              value={store.sellerPhone || ''}
              onChange={(e) =>
                setStore({
                  ...store,
                  sellerPhone: formatPhoneBr(e.target.value),
                })
              }
              placeholder="(11) 99999-9999"
              inputMode="tel"
              autoComplete="tel"
              maxLength={15}
            />
            <p className="mt-1 text-[11px] text-muted">
              Usado no botão “Conversar com vendedor” na vitrine e na NFC-e.
            </p>
          </div>
          <div>
            <label className="label">E-mail fiscal</label>
            <input
              className="field"
              type="email"
              value={store.sellerEmail || ''}
              onChange={(e) =>
                setStore({ ...store, sellerEmail: e.target.value })
              }
            />
          </div>
          <div className="md:col-span-2">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
              Endereço do emitente
            </p>
          </div>
          <div>
            <label className="label">CEP</label>
            <input
              className="field"
              value={store.sellerZipCode || ''}
              onChange={(e) =>
                setStore({ ...store, sellerZipCode: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">UF</label>
            <input
              className="field"
              maxLength={2}
              value={store.sellerState || ''}
              onChange={(e) =>
                setStore({
                  ...store,
                  sellerState: e.target.value.toUpperCase().slice(0, 2),
                })
              }
              placeholder="SP"
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Rua</label>
            <input
              className="field"
              value={store.sellerStreet || ''}
              onChange={(e) =>
                setStore({ ...store, sellerStreet: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">Número</label>
            <input
              className="field"
              value={store.sellerNumber || ''}
              onChange={(e) =>
                setStore({ ...store, sellerNumber: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">Bairro</label>
            <input
              className="field"
              value={store.sellerNeighborhood || ''}
              onChange={(e) =>
                setStore({ ...store, sellerNeighborhood: e.target.value })
              }
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Cidade</label>
            <input
              className="field"
              value={store.sellerCity || ''}
              onChange={(e) =>
                setStore({ ...store, sellerCity: e.target.value })
              }
            />
          </div>
          <button className="btn md:col-span-2">Salvar perfil</button>
        </form>
      </SettingsPanel>

      <SettingsPanel
        title="Políticas"
        summary="Termos, privacidade e trocas (páginas públicas da loja)"
        open={openSection === 'policies'}
        onToggle={() => toggleSection('policies')}
      >
        <form onSubmit={savePolicies} className="grid gap-3">
          <div>
            <label className="label">Termos de uso (HTML)</label>
            <textarea
              className="field min-h-[100px] resize-y font-mono text-xs"
              value={store.termsHtml || ''}
              onChange={(e) =>
                setStore({ ...store, termsHtml: e.target.value })
              }
              placeholder="<p>Termos de uso da loja...</p>"
            />
          </div>
          <div>
            <label className="label">Política de privacidade (HTML)</label>
            <textarea
              className="field min-h-[100px] resize-y font-mono text-xs"
              value={store.privacyHtml || ''}
              onChange={(e) =>
                setStore({ ...store, privacyHtml: e.target.value })
              }
              placeholder="<p>Como tratamos dados pessoais...</p>"
            />
          </div>
          <div>
            <label className="label">Trocas e devoluções (HTML)</label>
            <textarea
              className="field min-h-[100px] resize-y font-mono text-xs"
              value={store.returnsHtml || ''}
              onChange={(e) =>
                setStore({ ...store, returnsHtml: e.target.value })
              }
              placeholder="<p>Prazo e condições de troca...</p>"
            />
          </div>
          <button className="btn">Salvar políticas</button>
        </form>
      </SettingsPanel>

      <SettingsPanel
        title="Nota fiscal (NFC-e)"
        summary="Emissão automática via Focus NFe"
        badge={
          <StatusPill
            ok={!!store.nfeEnabled && !!store.nfeApiTokenSet}
            okLabel={store.nfeEnabled ? 'NFC-e ativa' : 'Desligada'}
            badLabel="Não configurada"
          />
        }
        open={openSection === 'nfe'}
        onToggle={() => toggleSection('nfe')}
      >
        <form onSubmit={saveNfe} className="grid gap-3 md:grid-cols-2">
          <p className="text-xs text-muted md:col-span-2">
            Use token Focus NFe. PF (CPF) e PJ (CNPJ) suportados. Homologação
            antes de produção.
          </p>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={!!store.nfeEnabled}
                onChange={(e) =>
                  setStore({ ...store, nfeEnabled: e.target.checked })
                }
              />
              Emitir NFC-e nos pedidos pagos
            </label>
          </div>
          <div>
            <label className="label">Ambiente</label>
            <select
              className="field"
              value={store.nfeEnvironment || 'homologacao'}
              onChange={(e) =>
                setStore({ ...store, nfeEnvironment: e.target.value })
              }
            >
              <option value="homologacao">Homologação</option>
              <option value="producao">Produção</option>
            </select>
          </div>
          <div>
            <label className="label">Série</label>
            <input
              className="field"
              value={store.nfeSeries || ''}
              onChange={(e) =>
                setStore({ ...store, nfeSeries: e.target.value })
              }
              placeholder="1"
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Token API (Focus NFe)</label>
            <input
              className="field"
              type="password"
              value={nfeApiToken}
              onChange={(e) => setNfeApiToken(e.target.value)}
              placeholder={
                store.nfeApiTokenSet
                  ? 'Token já configurado · deixe em branco para manter'
                  : 'Cole o token da Focus NFe'
              }
              autoComplete="new-password"
            />
            {store.nfeApiTokenSet ? (
              <p className="mt-0.5 text-[11px] text-[var(--ok)]">
                Token já salvo na loja
              </p>
            ) : null}
          </div>
          <div>
            <label className="label">CSC ID (opcional)</label>
            <input
              className="field"
              value={store.nfeCscId || ''}
              onChange={(e) =>
                setStore({ ...store, nfeCscId: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">CSC Token (opcional)</label>
            <input
              className="field"
              type="password"
              value={nfeCscToken}
              onChange={(e) => setNfeCscToken(e.target.value)}
              placeholder={
                store.nfeCscTokenSet
                  ? 'Já configurado · em branco para manter'
                  : undefined
              }
              autoComplete="new-password"
            />
          </div>
          <button className="btn md:col-span-2">Salvar NFC-e</button>
        </form>
      </SettingsPanel>

      <SettingsPanel
        title="Seu plano na plataforma"
        summary="Mensalidade que você paga pelo sistema"
        open={openSection === 'plan'}
        onToggle={() => toggleSection('plan')}
      >
      <div className="grid gap-3 md:grid-cols-2">
        <p className="text-xs text-muted md:col-span-2">
          Isso é o que <strong>você, dono da loja</strong>, paga — não é o
          pagamento dos seus clientes.
        </p>
        <div>
          <p className="text-[11px] font-bold uppercase text-muted">Plano</p>
          <p className="mt-1 font-semibold">{store.planName || '—'}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-muted">Status</p>
          <p className="mt-1 font-semibold">
            {store.status === 'ACTIVE'
              ? 'Ativa'
              : store.status === 'TRIAL'
                ? 'Trial'
                : store.status === 'PAST_DUE'
                  ? 'Em atraso'
                  : store.status === 'SUSPENDED'
                    ? 'Suspensa'
                    : store.status || '—'}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-muted">
            Mensalidade
          </p>
          <p className="mt-1 text-lg font-bold">
            {store.monthlyFee != null && store.monthlyFee !== ''
              ? `R$ ${Number(store.monthlyFee).toFixed(2).replace('.', ',')}`
              : 'A definir'}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-muted">
            Próximo vencimento
          </p>
          <p className="mt-1 font-semibold">
            {store.planDueAt
              ? new Date(store.planDueAt).toLocaleDateString('pt-BR')
              : '—'}
            {store.daysLeft != null ? (
              <span className="ml-2 text-xs font-normal text-muted">
                ({store.daysLeft < 0
                  ? 'vencido'
                  : `${store.daysLeft} dia${store.daysLeft === 1 ? '' : 's'}`})
              </span>
            ) : null}
          </p>
        </div>
        <div className="md:col-span-2">
          <Link href="/admin/settings/planos" className="btn inline-flex">
            Ver planos e pagar mensalidade
          </Link>
        </div>
      </div>
      </SettingsPanel>
      </div>
    </div>
  );
}
