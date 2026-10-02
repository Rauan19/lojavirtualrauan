'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { CabecalhoPagina } from '@/components/admin/Pagina';

type Liberacao = 'geral' | 'ligada' | 'desligada';

type LinhaLoja = {
  storeId: string;
  nome: string;
  slug: string;
  status: string;
  plano: string;
  feeBps: number;
  conectado: boolean;
  liberacao: Liberacao;
  cobradoCents: number;
  devolvidoCents: number;
  liquidoCents: number;
  pedidos: number;
};

type Relatorio = {
  mes: string;
  geral: { ligadaNoGeral: boolean; prazoConexao: string | null };
  totais: {
    cobradoCents: number;
    devolvidoCents: number;
    liquidoCents: number;
    pedidos: number;
  };
  lojas: LinhaLoja[];
  divergencias: {
    orderId: string;
    orderNumber: string;
    createdAt: string;
    mpPaymentId: string | null;
    esperadoCents: number;
    retidoCents: number;
    loja: string;
  }[];
};

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const pct = (bps: number) => `${String(bps / 100).replace('.', ',')}%`;

function mesAtual() {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Valor do <select> → corpo do PATCH. */
const VALOR: Record<Liberacao, boolean | null> = {
  geral: null,
  ligada: true,
  desligada: false,
};

export default function SuperComissoesPage() {
  const { confirm, dialog } = useConfirm();
  const [mes, setMes] = useState(mesAtual);
  const [dados, setDados] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<'movimento' | 'taxa' | 'todas'>(
    'movimento',
  );
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setCarregando(true);
    setErro('');
    try {
      setDados(
        await api<Relatorio>(`/platform-fee/relatorio?mes=${mes}`, { token }),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }, [mes]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const lojas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (dados?.lojas ?? []).filter((l) => {
      if (termo && !`${l.nome} ${l.slug}`.toLowerCase().includes(termo)) {
        return false;
      }
      if (filtro === 'movimento') return l.cobradoCents || l.devolvidoCents;
      if (filtro === 'taxa') return l.feeBps > 0;
      return true;
    });
  }, [dados, filtro, busca]);

  async function baixarCsv() {
    const token = getToken();
    if (!token) return;
    setErro('');
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || '/api';
      const res = await fetch(`${base}/platform-fee/relatorio.csv?mes=${mes}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Não foi possível gerar o CSV');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `comissoes-${mes}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao baixar');
    }
  }

  async function mudarLiberacao(loja: LinhaLoja, nova: Liberacao) {
    if (nova === loja.liberacao) return;
    if (nova === 'ligada' && !loja.conectado) {
      const ok = await confirm({
        title: 'Loja sem Mercado Pago conectado',
        message:
          'Sem a conexão, a comissão não é cobrada (e, depois do prazo, a loja deixa de receber pagamentos). Ligar mesmo assim?',
        confirmLabel: 'Ligar',
      });
      if (!ok) return;
    }
    const token = getToken();
    if (!token) return;
    try {
      await api(`/platform-fee/lojas/${loja.storeId}`, {
        method: 'PATCH',
        token,
        body: { platformFeeEnabled: VALOR[nova] },
      });
      setDados((d) =>
        d
          ? {
              ...d,
              lojas: d.lojas.map((l) =>
                l.storeId === loja.storeId ? { ...l, liberacao: nova } : l,
              ),
            }
          : d,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar');
    }
  }

  async function resolver(orderId: string) {
    const ok = await confirm({
      title: 'Marcar como conferida?',
      message:
        'Use depois de conferir no Mercado Pago o valor retido. O pedido sai da lista.',
      confirmLabel: 'Conferida',
    });
    if (!ok) return;
    const token = getToken();
    if (!token) return;
    try {
      await api(`/platform-fee/divergencias/${orderId}/resolver`, {
        method: 'POST',
        token,
      });
      setDados((d) =>
        d
          ? {
              ...d,
              divergencias: d.divergencias.filter((x) => x.orderId !== orderId),
            }
          : d,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar');
    }
  }

  const t = dados?.totais;

  return (
    <div className="admin-page max-w-5xl">
      {dialog}
      <CabecalhoPagina
        icone="/super/comissoes"
        titulo="Comissões"
        descricao="O que o Mercado Pago reteve para a plataforma em cada venda, por loja. Base para a nota fiscal do mês."
        acoes={
          <div className="flex items-end gap-2">
            <div>
              <label className="label" htmlFor="mes">
                Mês
              </label>
              <input
                id="mes"
                type="month"
                className="field"
                value={mes}
                max={mesAtual()}
                onChange={(e) => e.target.value && setMes(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void baixarCsv()}
            >
              Baixar CSV
            </button>
          </div>
        }
      />

      {erro ? (
        <p
          role="alert"
          className="rounded-xl border border-[#f3b3b3] bg-[#fef2f2] px-4 py-3 text-sm text-accent"
        >
          {erro}
        </p>
      ) : null}

      {dados ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            dados.geral.ligadaNoGeral
              ? 'border-[#bfe3c8] bg-[#f0fbf3] text-[#166534]'
              : 'border-[#f0d998] bg-[#fff8e1] text-[#6b4f00]'
          }`}
        >
          {dados.geral.ligadaNoGeral
            ? 'Cobrança ligada para todas as lojas (exceto as marcadas como desligada).'
            : 'Cobrança desligada no geral (PLATFORM_FEE_ENABLED). Só as lojas marcadas como "ligada" pagam comissão — use para liberar aos poucos.'}
          {dados.geral.prazoConexao
            ? ` Prazo para conectar o Mercado Pago: ${new Date(dados.geral.prazoConexao).toLocaleDateString('pt-BR')}.`
            : ' Sem prazo para conectar o Mercado Pago (PLATFORM_FEE_OAUTH_DEADLINE).'}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Vendas com taxa', t ? String(t.pedidos) : '—'],
          ['Cobrado', t ? reais(t.cobradoCents) : '—'],
          ['Devolvido', t ? reais(t.devolvidoCents) : '—'],
          ['Líquido do mês', t ? reais(t.liquidoCents) : '—'],
        ].map(([rotulo, valor]) => (
          <div
            key={rotulo}
            className={`rounded-2xl px-5 py-4 ${
              rotulo === 'Líquido do mês'
                ? 'bg-[var(--brand-deep)] text-white'
                : 'border border-line bg-white'
            }`}
          >
            <dt
              className={`text-[13px] font-medium ${
                rotulo === 'Líquido do mês' ? 'text-white/75' : 'text-muted'
              }`}
            >
              {rotulo}
            </dt>
            <dd className="mt-1 text-[1.5rem] font-bold leading-tight tabular-nums">
              {carregando ? '…' : valor}
            </dd>
          </div>
        ))}
      </dl>

      {dados && dados.divergencias.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-rose-200 bg-white">
          <h2 className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-[14px] font-bold text-rose-800">
            Divergências ({dados.divergencias.length}) — o Mercado Pago reteve
            valor diferente do calculado
          </h2>
          <ul className="divide-y divide-line">
            {dados.divergencias.map((d) => (
              <li
                key={d.orderId}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
              >
                <span>
                  <strong>{d.loja}</strong> · pedido #{d.orderNumber}
                  {d.mpPaymentId ? ` · pagamento ${d.mpPaymentId}` : ''} ·
                  esperado {reais(d.esperadoCents)}, retido{' '}
                  {reais(d.retidoCents)}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost h-8 px-3 text-[12px]"
                  onClick={() => void resolver(d.orderId)}
                >
                  Marcar conferida
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-bold">Por loja</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="field max-w-xs"
              placeholder="Buscar loja"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar loja"
            />
            <select
              className="field w-auto"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as typeof filtro)}
              aria-label="Filtrar lojas"
            >
              <option value="movimento">Com movimento no mês</option>
              <option value="taxa">Plano com taxa</option>
              <option value="todas">Todas as lojas</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left">
              <tr>
                <th className="px-5">Loja</th>
                <th className="px-3">Taxa</th>
                <th className="px-3">Mercado Pago</th>
                <th className="px-3 text-right">Vendas</th>
                <th className="px-3 text-right">Cobrado</th>
                <th className="px-3 text-right">Devolvido</th>
                <th className="px-3 text-right">Líquido</th>
                <th className="px-5">Cobrança</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lojas.map((l) => (
                <tr key={l.storeId}>
                  <td className="px-5">
                    <p className="font-semibold">{l.nome}</p>
                    <p className="text-xs text-muted">{l.slug}</p>
                  </td>
                  <td className="px-3">{l.feeBps ? pct(l.feeBps) : '—'}</td>
                  <td className="px-3">
                    {l.conectado ? (
                      <span className="rounded-full bg-[#e8f6ee] px-2 py-0.5 text-[12px] font-semibold text-[#166534]">
                        Conectado
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#fff6e0] px-2 py-0.5 text-[12px] font-semibold text-[#8a5a00]">
                        Não conectado
                      </span>
                    )}
                  </td>
                  <td className="px-3 text-right tabular-nums">{l.pedidos}</td>
                  <td className="px-3 text-right tabular-nums">
                    {reais(l.cobradoCents)}
                  </td>
                  <td className="px-3 text-right tabular-nums">
                    {reais(l.devolvidoCents)}
                  </td>
                  <td className="px-3 text-right font-semibold tabular-nums">
                    {reais(l.liquidoCents)}
                  </td>
                  <td className="px-5">
                    <select
                      className="field h-9 w-auto text-[13px]"
                      value={l.liberacao}
                      onChange={(e) =>
                        void mudarLiberacao(l, e.target.value as Liberacao)
                      }
                      aria-label={`Cobrança da loja ${l.nome}`}
                    >
                      <option value="geral">
                        Segue o geral (
                        {dados?.geral.ligadaNoGeral ? 'ligada' : 'desligada'})
                      </option>
                      <option value="ligada">Ligada</option>
                      <option value="desligada">Desligada</option>
                    </select>
                  </td>
                </tr>
              ))}
              {!carregando && lojas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-muted">
                    Nenhuma loja neste filtro.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
