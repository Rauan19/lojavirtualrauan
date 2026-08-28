'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  publicKey: string;
  amount: number;
  payerEmail?: string;
  onSubmit: (formData: {
    token: string;
    payment_method_id?: string;
  }) => Promise<void>;
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
    __mpSubBrickController?: { unmount: () => void } | null;
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

function brickErrorMessage(err: unknown): string {
  if (!err) return 'Não foi possível abrir o formulário de cartão';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object') {
    const o = err as { message?: string; cause?: string };
    return o.message || o.cause || 'Erro no Brick';
  }
  return 'Erro no Brick';
}

/**
 * Card Payment Brick embutido — só cartão, sem sair da página.
 * Usado na assinatura recorrente da plataforma.
 */
export function MpSubscriptionCardBrick({
  publicKey,
  amount,
  payerEmail,
  onSubmit,
  onError,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const onSubmitRef = useRef(onSubmit);
  const onErrorRef = useRef(onError);
  onSubmitRef.current = onSubmit;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let controller: { unmount: () => void } | null = null;

    setReady(false);
    setLoadError('');

    async function mount() {
      try {
        if (!publicKey?.trim()) {
          throw new Error('Public Key da plataforma ausente');
        }
        const safeAmount = Math.round(Number(amount) * 100) / 100;
        if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
          throw new Error('Valor inválido');
        }

        await loadMpSdk();
        if (cancelled || !window.MercadoPago || !hostRef.current) return;

        if (window.__mpSubBrickController) {
          try {
            window.__mpSubBrickController.unmount();
          } catch {
            /* ignore */
          }
          window.__mpSubBrickController = null;
        }

        hostRef.current.innerHTML = '';
        const containerId = `mp_sub_card_${Date.now()}`;
        const box = document.createElement('div');
        box.id = containerId;
        hostRef.current.appendChild(box);

        const mp = new window.MercadoPago(publicKey.trim(), {
          locale: 'pt-BR',
        });

        const email = (payerEmail || '').trim();

        controller = await mp.bricks().create('cardPayment', containerId, {
          initialization: {
            amount: safeAmount,
            ...(email ? { payer: { email } } : {}),
          },
          customization: {
            visual: {
              style: { theme: 'flat' },
              hideFormTitle: true,
            },
          },
          callbacks: {
            onReady: () => {
              if (!cancelled) setReady(true);
            },
            onError: (err: unknown) => {
              if (cancelled) return;
              const msg = brickErrorMessage(err);
              setLoadError(msg);
              onErrorRef.current?.(msg);
            },
            onSubmit: async (formData: Record<string, unknown>) => {
              const token = String(
                formData.token || formData.card_token_id || '',
              ).trim();
              if (!token) {
                throw new Error('Token do cartão não gerado');
              }
              await onSubmitRef.current({
                token,
                payment_method_id: formData.payment_method_id
                  ? String(formData.payment_method_id)
                  : undefined,
              });
            },
          },
        });

        window.__mpSubBrickController = controller;
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
      try {
        controller?.unmount();
      } catch {
        /* ignore */
      }
      if (window.__mpSubBrickController === controller) {
        window.__mpSubBrickController = null;
      }
    };
  }, [publicKey, amount, payerEmail]);

  return (
    <div className="relative min-h-[220px]">
      {!ready && !loadError ? (
        <p className="absolute inset-x-0 top-6 text-center text-sm text-muted">
          Carregando formulário de cartão…
        </p>
      ) : null}
      {loadError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {loadError}
        </p>
      ) : null}
      <div ref={hostRef} className={ready ? '' : 'opacity-0'} />
    </div>
  );
}
