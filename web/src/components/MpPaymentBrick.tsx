'use client';

import { useEffect, useRef, useState } from 'react';

export type BrickPayerAddress = {
  zipCode: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement?: string;
};

type BrickProps = {
  publicKey: string;
  amount: number;
  payerEmail?: string;
  payerName?: string;
  /** Endereço de entrega — pré-preenche boleto e evita get_address_data_failed */
  payerAddress?: BrickPayerAddress | null;
  onSubmit: (
    formData: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | void>;
  onError?: (message: string) => void;
};

type MpBricks = {
  create: (
    type: string,
    containerId: string,
    settings: Record<string, unknown>,
  ) => Promise<{ unmount: () => void }>;
};

type MpInstance = {
  bricks: () => MpBricks;
};

declare global {
  interface Window {
    MercadoPago?: new (
      publicKey: string,
      options?: { locale: string },
    ) => MpInstance;
    __mpBrickController?: { unmount: () => void } | null;
  }
}

function loadMpSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.MercadoPago) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-mp-sdk]',
    );
    if (existing) {
      if (window.MercadoPago) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Falha ao carregar Mercado Pago')),
      );
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.dataset.mpSdk = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar Mercado Pago'));
    document.body.appendChild(script);
  });
}

function normalizeAmount(value: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** UF: "bahia" / "Ba" → "BA" */
function normalizeUf(state: string) {
  const raw = state.trim();
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const map: Record<string, string> = {
    acre: 'AC',
    alagoas: 'AL',
    amapa: 'AP',
    amazonas: 'AM',
    bahia: 'BA',
    ceara: 'CE',
    'distrito federal': 'DF',
    'espirito santo': 'ES',
    goias: 'GO',
    maranhao: 'MA',
    'mato grosso': 'MT',
    'mato grosso do sul': 'MS',
    'minas gerais': 'MG',
    para: 'PA',
    paraiba: 'PB',
    parana: 'PR',
    pernambuco: 'PE',
    piaui: 'PI',
    'rio de janeiro': 'RJ',
    'rio grande do norte': 'RN',
    'rio grande do sul': 'RS',
    rondonia: 'RO',
    roraima: 'RR',
    'santa catarina': 'SC',
    'sao paulo': 'SP',
    sergipe: 'SE',
    tocantins: 'TO',
  };
  const key = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  return map[key] || raw.slice(0, 2).toUpperCase();
}

function toBrickAddress(addr?: BrickPayerAddress | null) {
  if (!addr?.zipCode || !addr.street) return null;
  const zipCode = addr.zipCode.replace(/\D/g, '');
  if (zipCode.length !== 8) return null;
  const streetNumber = String(addr.number || 's/n').trim() || 's/n';
  const federalUnit = normalizeUf(addr.state || '');
  if (!federalUnit || !addr.city?.trim() || !addr.neighborhood?.trim()) {
    return null;
  }
  return {
    zipCode,
    federalUnit,
    city: addr.city.trim(),
    neighborhood: addr.neighborhood.trim(),
    streetName: addr.street.trim(),
    streetNumber,
    ...(addr.complement?.trim()
      ? { complement: addr.complement.trim() }
      : {}),
  };
}

/** Public Key = UUID. Access Token = APP_USR-NUMERO-... */
function looksLikeAccessTokenAsPublicKey(value: string) {
  const v = value.trim();
  if (
    /^(TEST|APP_USR)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      v,
    )
  ) {
    return false;
  }
  return /^(TEST|APP_USR)-\d{10,}-/.test(v) || v.length > 90;
}

function isAlreadyInitialized(err: unknown) {
  const msg = brickErrorMessage(err).toLowerCase();
  return (
    msg.includes('already_initialized') ||
    msg.includes('already initialized') ||
    msg.includes('já foi inicializado')
  );
}

function brickErrorMessage(err: unknown): string {
  if (!err) return 'Não foi possível abrir o pagamento';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) {
    const anyErr = err as Error & {
      cause?: unknown;
      data?: { cause?: string; message?: string };
    };
    if (anyErr.data?.cause) return String(anyErr.data.cause);
    if (anyErr.data?.message) return String(anyErr.data.message);
    return err.message;
  }
  if (typeof err === 'object') {
    const o = err as {
      message?: string;
      cause?: string | { message?: string; description?: string; code?: string };
      error?: string;
      type?: string;
    };
    if (typeof o.cause === 'string') return o.cause;
    if (o.cause && typeof o.cause === 'object') {
      return (
        o.cause.code ||
        o.cause.message ||
        o.cause.description ||
        o.message ||
        'Erro ao iniciar Brick'
      );
    }
    if (o.message) return o.message;
    if (o.type) return o.type;
    if (o.error) return o.error;
    try {
      return JSON.stringify(err);
    } catch {
      /* ignore */
    }
  }
  return 'Não foi possível abrir o pagamento';
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function forceUnmountGlobal() {
  const prev = window.__mpBrickController;
  if (prev) {
    try {
      prev.unmount();
    } catch {
      /* ignore */
    }
    window.__mpBrickController = null;
  }
}

/**
 * Payment Brick (guest): cartão e Pix.
 * Sem "mercadoPago" (carteira) — exige preferenceId.
 * Sem boleto (ticket).
 */
export function MpPaymentBrick({
  publicKey,
  amount,
  payerEmail,
  payerName,
  payerAddress,
  onSubmit,
  onError,
}: BrickProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const onSubmitRef = useRef(onSubmit);
  const onErrorRef = useRef(onError);
  onSubmitRef.current = onSubmit;
  onErrorRef.current = onError;

  const addressKey = payerAddress
    ? [
        payerAddress.zipCode,
        payerAddress.street,
        payerAddress.number,
        payerAddress.neighborhood,
        payerAddress.city,
        payerAddress.state,
        payerAddress.complement || '',
      ].join('|')
    : '';

  useEffect(() => {
    let cancelled = false;
    let controller: { unmount: () => void } | null = null;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    const mountToken = `mpb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    setReady(false);
    setLoadError('');

    async function createBrick(containerId: string) {
      if (!window.MercadoPago) throw new Error('SDK Mercado Pago indisponível');

      const safeAmount = normalizeAmount(amount);
      if (!publicKey?.trim()) {
        throw new Error('Public Key do Mercado Pago ausente');
      }
      if (safeAmount == null) {
        throw new Error(`Valor inválido para pagamento (R$ ${String(amount)})`);
      }

      const host = hostRef.current;
      if (!host) throw new Error('Container do Brick não encontrado');

      host.innerHTML = '';
      const box = document.createElement('div');
      box.id = containerId;
      host.appendChild(box);

      const mp = new window.MercadoPago(publicKey.trim(), {
        locale: 'pt-BR',
      });

      const nameParts = (payerName || '').trim().split(/\s+/).filter(Boolean);
      const email = (payerEmail || '').trim();
      const brickAddress = toBrickAddress(payerAddress);

      const payerInit: Record<string, unknown> = {
        ...(email ? { email } : {}),
        ...(nameParts[0] ? { firstName: nameParts[0] } : {}),
        ...(nameParts.length > 1
          ? { lastName: nameParts.slice(1).join(' ') }
          : {}),
        ...(brickAddress ? { address: brickAddress } : {}),
      };

      const settings = {
        initialization: {
          amount: safeAmount,
          ...(Object.keys(payerInit).length ? { payer: payerInit } : {}),
        },
        customization: {
          paymentMethods: {
            creditCard: 'all',
            debitCard: 'all',
            bankTransfer: 'all',
            maxInstallments: 12,
            minInstallments: 1,
          },
          visual: {
            style: {
              theme: 'default',
            },
          },
        },
        callbacks: {
          onReady: () => {
            if (!cancelled) setReady(true);
          },
          onError: (err: unknown) => {
            if (cancelled || isAlreadyInitialized(err)) return;
            const msg = brickErrorMessage(err);
            // CEP lookup do Brick falhou, mas já temos endereço — não bloqueia a UI
            if (
              msg.toLowerCase().includes('get_address_data_failed') &&
              brickAddress
            ) {
              return;
            }
            setLoadError(msg);
            onErrorRef.current?.(msg);
          },
          onSubmit: async ({
            formData,
          }: {
            formData: Record<string, unknown>;
          }) => onSubmitRef.current(formData),
        },
      };

      return mp.bricks().create('payment', containerId, settings);
    }

    async function mount() {
      try {
        const safeAmount = normalizeAmount(amount);
        if (!publicKey?.trim()) {
          throw new Error('Public Key do Mercado Pago ausente');
        }
        if (looksLikeAccessTokenAsPublicKey(publicKey)) {
          throw new Error(
            'A Public Key salva parece um Access Token. No Admin → Configurações → Pagamento, cole a Public Key (formato APP_USR-uuid ou TEST-uuid) do painel Mercado Pago — não o Access Token.',
          );
        }
        if (safeAmount == null) {
          throw new Error(
            `Valor inválido para pagamento (R$ ${String(amount)})`,
          );
        }

        await loadMpSdk();
        if (cancelled) return;

        forceUnmountGlobal();
        await sleep(120);
        if (cancelled) return;

        try {
          controller = await createBrick(mountToken);
        } catch (err) {
          if (cancelled) return;
          if (isAlreadyInitialized(err)) {
            forceUnmountGlobal();
            await sleep(350);
            if (cancelled) return;
            controller = await createBrick(`${mountToken}_r`);
          } else {
            throw err;
          }
        }

        if (cancelled) {
          try {
            controller.unmount();
          } catch {
            /* ignore */
          }
          return;
        }

        window.__mpBrickController = controller;

        readyTimer = setTimeout(() => {
          if (cancelled) return;
          const host = hostRef.current;
          const hasUi = Boolean(
            host && host.querySelector('iframe, form, button, input'),
          );
          if (hasUi) {
            setReady(true);
            return;
          }
          const msg =
            'Checkout não carregou a tempo. Confira se Public Key e Access Token são do mesmo ambiente (teste ou produção) e tente de novo.';
          setLoadError(msg);
          onErrorRef.current?.(msg);
        }, 12000);
      } catch (err) {
        if (cancelled) return;
        const msg = brickErrorMessage(err);
        setLoadError(msg);
        onErrorRef.current?.(msg);
      }
    }

    void mount();

    return () => {
      cancelled = true;
      if (readyTimer) clearTimeout(readyTimer);
      if (controller) {
        try {
          controller.unmount();
        } catch {
          /* ignore */
        }
        if (window.__mpBrickController === controller) {
          window.__mpBrickController = null;
        }
      }
      if (hostRef.current) hostRef.current.innerHTML = '';
    };
  }, [publicKey, amount, payerEmail, payerName, addressKey, retryKey]);

  return (
    <div className="space-y-2">
      {!ready && !loadError ? (
        <p className="text-xs text-muted">
          Carregando cartão e Pix...
        </p>
      ) : null}
      {loadError ? (
        <div className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <p className="font-semibold">Falha ao abrir o checkout</p>
          <p className="mt-1 break-words text-xs">{loadError}</p>
          <p className="mt-2 text-[11px] text-rose-800/80">
            Public Key e Access Token precisam ser do mesmo ambiente (ambos
            teste ou ambos produção). Depois recarregue ou clique em tentar de
            novo.
          </p>
          <button
            type="button"
            className="btn btn-ghost mt-3 text-sm"
            onClick={() => {
              setLoadError('');
              setRetryKey((k) => k + 1);
            }}
          >
            Tentar carregar de novo
          </button>
        </div>
      ) : null}
      <div ref={hostRef} className="min-h-[280px] w-full" />
    </div>
  );
}
