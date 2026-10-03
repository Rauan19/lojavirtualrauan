'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, money } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { BRAND } from '@/lib/brand';

export type TaxaDaLoja = {
  mes: string;
  feeBps: number;
  planName: string | null;
  cobrancaAtiva: boolean;
  conectado: boolean;
  prazoConexao: string | null;
  totais: {
    cobradoCents: number;
    devolvidoCents: number;
    liquidoCents: number;
    pedidos: number;
  };
};

/** "2" ou "0,5" — taxa em pontos-base para texto. */
export function percentual(bps: number) {
  return String(bps / 100).replace('.', ',');
}

/** Carrega /platform-fee/me (mês atual ou o informado). */
export function useTaxaDaLoja(mes?: string) {
  const [dados, setDados] = useState<TaxaDaLoja | null>(null);
  useEffect(() => {
    const user = getUser();
    const token = getToken();
    if (!user?.store?.slug || !token) return;
    let cancelado = false;
    api<TaxaDaLoja>(
      `/platform-fee/me${mes ? `?mes=${encodeURIComponent(mes)}` : ''}`,
      {
        token,
        storeSlug: user.store.slug,
      },
    )
      .then((d) => {
        if (!cancelado) setDados(d);
      })
      .catch(() => {
        /* silencioso: aviso some, painel segue */
      });
    return () => {
      cancelado = true;
    };
  }, [mes]);
  return dados;
}

/**
 * Faixa no topo do painel: plano com taxa e Mercado Pago ainda não
 * conectado pela plataforma. Com prazo definido, mostra a data limite.
 */
export function AvisoConexaoMp({ taxa }: { taxa: TaxaDaLoja | null }) {
  if (!taxa || taxa.feeBps <= 0 || taxa.conectado) return null;
  if (!taxa.cobrancaAtiva && !taxa.prazoConexao) return null;
  const prazo = taxa.prazoConexao
    ? new Date(taxa.prazoConexao).toLocaleDateString('pt-BR')
    : null;
  const vencido = taxa.prazoConexao
    ? new Date(taxa.prazoConexao).getTime() <= Date.now()
    : false;
  return (
    <div
      className={`mb-3 flex flex-wrap items-center justify-between gap-2 border px-3 py-2 text-sm ${
        vencido
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-[#bcd7f5] bg-[#eef6ff] text-[#0b4a8b]'
      }`}
    >
      <span>
        {vencido
          ? 'Sua loja não está recebendo pagamentos online: conecte a conta do Mercado Pago para voltar a vender.'
          : `Conecte sua conta do Mercado Pago${prazo ? ` até ${prazo}` : ''}. É por ela que o dinheiro das vendas cai para você${prazo ? ' — depois dessa data, sem a conexão, a loja não recebe pagamentos online' : ''}.`}
      </span>
      <Link
        href="/admin/settings?secao=payments"
        className="font-semibold underline-offset-2 hover:underline"
      >
        Conectar agora
      </Link>
    </div>
  );
}

/** Cartão "Taxas deste mês" na tela de planos. */
export function ResumoTaxas() {
  const taxa = useTaxaDaLoja();
  if (!taxa || (taxa.feeBps <= 0 && taxa.totais.cobradoCents === 0))
    return null;
  const t = taxa.totais;
  const [ano, mes] = taxa.mes.split('-');
  return (
    <section className="mb-4 rounded-2xl border border-black/10 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold">
          Taxa {BRAND.name} · {mes}/{ano}
        </p>
        <p className="text-xs text-muted">
          {taxa.feeBps > 0
            ? `${percentual(taxa.feeBps)}% por venda no seu plano`
            : 'Seu plano atual não tem taxa por venda'}
          {taxa.feeBps > 0 && !taxa.cobrancaAtiva
            ? ' · ainda não está sendo cobrada'
            : ''}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">Vendas com taxa</dt>
          <dd className="font-semibold">{t.pedidos}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Taxas descontadas</dt>
          <dd className="font-semibold">{money(t.cobradoCents / 100)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Devolvidas (estornos)</dt>
          <dd className="font-semibold">{money(t.devolvidoCents / 100)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Total do mês</dt>
          <dd className="font-bold">{money(t.liquidoCents / 100)}</dd>
        </div>
      </dl>
    </section>
  );
}
