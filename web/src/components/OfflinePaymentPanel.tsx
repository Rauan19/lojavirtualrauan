'use client';

import { useMemo, useState } from 'react';
import { money } from '@/lib/api';

export type OfflinePaymentInfo = {
  paymentId?: number | string;
  status?: string;
  qrCode?: string | null;
  qrCodeBase64?: string | null;
  ticketUrl?: string | null;
  /** Linha digitável do boleto (quando o MP devolver) */
  digitableLine?: string | null;
  barcode?: string | null;
};

type Props = {
  info: OfflinePaymentInfo;
  amount?: number;
  orderLabel?: string;
};

/** Formata linha digitável Febraban: 00000.00000 00000.000000 00000.000000 0 00000000000000 */
function formatDigitableLine(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.length === 47) {
    return [
      `${d.slice(0, 5)}.${d.slice(5, 10)}`,
      `${d.slice(10, 15)}.${d.slice(15, 21)}`,
      `${d.slice(21, 26)}.${d.slice(26, 32)}`,
      d.slice(32, 33),
      d.slice(33, 47),
    ].join(' ');
  }
  if (d.length === 48) {
    return [
      `${d.slice(0, 5)}.${d.slice(5, 10)}`,
      `${d.slice(10, 15)}.${d.slice(15, 21)}`,
      `${d.slice(21, 26)}.${d.slice(26, 32)}`,
      d.slice(32, 33),
      d.slice(33, 48),
    ].join(' ');
  }
  return raw.trim();
}

/** Converte linha digitável (47) → código de barras (44). */
function digitableToBarcode(linha: string): string | null {
  const d = linha.replace(/\D/g, '');
  if (d.length === 44) return d;
  if (d.length !== 47) return null;
  return (
    d.slice(0, 4) +
    d.slice(32, 33) +
    d.slice(33, 47) +
    d.slice(4, 9) +
    d.slice(10, 20) +
    d.slice(21, 31)
  );
}

/** ITF (Interleaved 2 of 5) — padrão do boleto brasileiro. */
const ITF_PATTERNS: Record<string, string> = {
  '0': '00110',
  '1': '10001',
  '2': '01001',
  '3': '11000',
  '4': '00101',
  '5': '10100',
  '6': '01100',
  '7': '00011',
  '8': '10010',
  '9': '01010',
};

function buildItfModules(digits: string): boolean[] {
  let data = digits.replace(/\D/g, '');
  if (data.length % 2 === 1) data = `0${data}`;
  const modules: boolean[] = [];
  // start nnnn
  modules.push(true, false, true, false);
  for (let i = 0; i < data.length; i += 2) {
    const bars = ITF_PATTERNS[data[i]] || ITF_PATTERNS['0'];
    const spaces = ITF_PATTERNS[data[i + 1]] || ITF_PATTERNS['0'];
    for (let j = 0; j < 5; j++) {
      const barWide = bars[j] === '1';
      modules.push(true);
      if (barWide) modules.push(true, true);
      const spaceWide = spaces[j] === '1';
      modules.push(false);
      if (spaceWide) modules.push(false, false);
    }
  }
  // end: wide bar, narrow space, narrow bar
  modules.push(true, true, true, false, true);
  return modules;
}

function BoletoBarcode({ value }: { value: string }) {
  const modules = useMemo(() => buildItfModules(value), [value]);
  const narrow = 1.4;
  const height = 56;
  const width = modules.length * narrow;

  let x = 0;
  const rects: { x: number; w: number }[] = [];
  let i = 0;
  while (i < modules.length) {
    if (!modules[i]) {
      i += 1;
      x += narrow;
      continue;
    }
    let run = 0;
    while (i < modules.length && modules[i]) {
      run += 1;
      i += 1;
    }
    rects.push({ x, w: run * narrow });
    x += run * narrow;
  }

  return (
    <svg
      role="img"
      aria-label="Código de barras do boleto"
      viewBox={`0 0 ${width} ${height}`}
      className="h-14 w-full max-w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={0} y={0} width={width} height={height} fill="#fff" />
      {rects.map((r, idx) => (
        <rect
          key={idx}
          x={r.x}
          y={0}
          width={r.w}
          height={height}
          fill="#111"
        />
      ))}
    </svg>
  );
}

/**
 * Tela própria de Pix/boleto — o Payment Brick NÃO mostra o QR/boleto sozinho;
 * a doc do MP pede Status Screen Brick ou UI própria com os dados do /v1/payments.
 */
export function OfflinePaymentPanel({ info, amount, orderLabel }: Props) {
  const [copied, setCopied] = useState<'pix' | 'boleto' | ''>('');

  const barcodeDigits = useMemo(() => {
    const fromMp = info.barcode?.replace(/\D/g, '') || '';
    if (fromMp.length >= 44) return fromMp.slice(0, 44);
    if (info.digitableLine) {
      return digitableToBarcode(info.digitableLine) || '';
    }
    return '';
  }, [info.barcode, info.digitableLine]);

  const digitableRaw = (info.digitableLine || '').replace(/\D/g, '');
  const digitableDisplay = digitableRaw
    ? formatDigitableLine(info.digitableLine || digitableRaw)
    : '';

  const hasPix = Boolean(info.qrCode || info.qrCodeBase64);
  const hasBoleto = Boolean(
    info.ticketUrl || digitableDisplay || barcodeDigits,
  );

  async function copyText(value: string, kind: 'pix' | 'boleto') {
    try {
      await navigator.clipboard.writeText(value.replace(/\s/g, ''));
      setCopied(kind);
      setTimeout(() => setCopied(''), 2500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4 border border-[#3483fa]/25 bg-[#3483fa]/5 p-4">
      <div>
        <p className="text-sm font-bold text-[#1a4f9c]">
          {hasPix
            ? 'Pague com Pix'
            : hasBoleto
              ? 'Pague o boleto'
              : 'Pagamento pendente'}
        </p>
        <p className="mt-1 text-xs text-[#1a4f9c]/90">
          {orderLabel ? `${orderLabel} · ` : ''}
          {amount != null ? money(amount) : null}
          {amount != null ? ' · ' : ''}
          Esta tela atualiza sozinha quando o pagamento cair.
        </p>
      </div>

      {info.qrCodeBase64 ? (
        <div className="flex justify-center bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${info.qrCodeBase64}`}
            alt="QR Code Pix"
            className="h-52 w-52 object-contain"
          />
        </div>
      ) : null}

      {info.qrCode ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Pix copia e cola
          </p>
          <textarea
            className="field min-h-[88px] resize-y font-mono text-[11px] leading-snug"
            readOnly
            value={info.qrCode}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            className="btn btn-accent w-full"
            onClick={() => void copyText(info.qrCode!, 'pix')}
          >
            {copied === 'pix' ? 'Código copiado!' : 'Copiar código Pix'}
          </button>
        </div>
      ) : null}

      {hasBoleto && !hasPix ? (
        <div className="space-y-3 rounded-sm border border-line bg-white p-3 shadow-sm">
          {barcodeDigits ? (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Código de barras
              </p>
              <div className="overflow-x-auto rounded-sm border border-line bg-white px-2 py-3">
                <BoletoBarcode value={barcodeDigits} />
              </div>
              <p className="break-all text-center font-mono text-[10px] tracking-wider text-ink/80">
                {barcodeDigits}
              </p>
            </div>
          ) : null}

          {digitableDisplay ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Linha digitável
              </p>
              <button
                type="button"
                className="w-full rounded-sm border border-line bg-[#f7f8fa] px-3 py-3 text-left transition hover:border-ink/30"
                onClick={() =>
                  void copyText(
                    digitableRaw || digitableDisplay,
                    'boleto',
                  )
                }
                title="Clique para copiar"
              >
                <span className="block font-mono text-[12px] font-semibold leading-relaxed tracking-wide text-ink sm:text-[13px]">
                  {digitableDisplay}
                </span>
                <span className="mt-2 block text-[11px] text-muted">
                  {copied === 'boleto'
                    ? 'Linha copiada!'
                    : 'Toque para copiar a linha digitável'}
                </span>
              </button>
            </div>
          ) : null}

          {info.ticketUrl ? (
            <a
              href={info.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-accent inline-flex w-full justify-center"
            >
              Abrir / imprimir boleto completo
            </a>
          ) : null}
        </div>
      ) : null}

      {hasBoleto && hasPix && info.ticketUrl ? (
        <a
          href={info.ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-accent inline-flex w-full justify-center"
        >
          Abrir / imprimir boleto
        </a>
      ) : null}

      {!hasPix && !hasBoleto ? (
        <p className="text-sm text-amber-900">
          Pagamento criado, mas o Mercado Pago não devolveu QR/boleto. Confira as
          credenciais de teste da conta real e tente de novo.
        </p>
      ) : null}
    </div>
  );
}
