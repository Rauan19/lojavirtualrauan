'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { BRAND } from '@/lib/brand';

/**
 * Termos mudaram depois do cadastro da loja: o painel pede o novo aceite.
 *
 * Bloqueia o painel (não a vitrine) até aceitar. A taxa por venda só passa a
 * ser cobrada de quem aceitou — o aceite fica gravado com data e IP.
 */
export function TermosAtualizados({
  open,
  onAceito,
}: {
  open: boolean;
  onAceito: () => void;
}) {
  const [li, setLi] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  if (!open) return null;

  async function aceitar() {
    const user = getUser();
    const token = getToken();
    if (!user?.store?.slug || !token) return;
    setEnviando(true);
    setErro('');
    try {
      await api('/stores/me/terms', {
        method: 'POST',
        token,
        storeSlug: user.store.slug,
      });
      onAceito();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar o aceite');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="termos-titulo"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-line bg-white p-6 shadow-xl sm:rounded-md">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--accent,#2563eb)]">
          Termos de uso atualizados
        </p>
        <h2 id="termos-titulo" className="mt-1 text-lg font-bold text-ink">
          O que mudou
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
          <li>
            Cada plano agora tem uma <strong className="text-ink">taxa por venda</strong>,
            mostrada em Configurações → Planos. No plano grátis ela substitui a
            mensalidade.
          </li>
          <li>
            A taxa é calculada só sobre os produtos menos descontos — o frete não
            entra — e o Mercado Pago desconta na hora do pagamento. Não chega
            boleto nem cobrança separada.
          </li>
          <li>
            Estornou a venda? A taxa volta na mesma proporção. Você vê a taxa de
            cada pedido e o total do mês no painel.
          </li>
          <li>
            Para isso, a loja conecta a própria conta pelo botão &quot;Conectar com
            Mercado Pago&quot; em Configurações → Pagamentos.
          </li>
        </ul>
        <p className="mt-3 text-sm text-muted">
          <Link href="/termos" target="_blank" className="font-semibold text-ink underline">
            Ler os termos completos
          </Link>
        </p>

        <label className="mt-4 flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={li}
            onChange={(e) => setLi(e.target.checked)}
          />
          <span>
            Li e aceito os novos Termos de Uso da {BRAND.name}.
          </span>
        </label>
        {erro ? <p className="mt-2 text-sm text-rose-700">{erro}</p> : null}

        <button
          type="button"
          className="btn btn-accent mt-4 w-full"
          disabled={!li || enviando}
          onClick={() => void aceitar()}
        >
          {enviando ? 'Registrando...' : 'Aceitar e continuar'}
        </button>
        <p className="mt-3 text-xs text-muted">
          Se não concordar, a vitrine continua no ar e você pode cancelar a
          assinatura sem multa falando com o suporte.
        </p>
      </div>
    </div>
  );
}
