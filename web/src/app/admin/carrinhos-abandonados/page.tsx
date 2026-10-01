'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, money } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Carrinho = {
  id: string;
  orderNumber: string;
  abandonadoEm: string;
  emailEnviadoEm: string | null;
  cliente: string;
  email: string;
  telefone: string | null;
  total: number;
  itens: { nome: string; quantidade: number }[];
  recuperadoNoPedido: string | null;
  link: string;
};

type Resposta = {
  emailAutomatico: boolean;
  total: number;
  recuperados: number;
  carrinhos: Carrinho[];
};

function opcoes() {
  const user = getUser();
  return { token: getToken(), storeSlug: user?.store?.slug };
}

function quando(iso: string) {
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (dias === 0)
    return `hoje, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

/** Link do WhatsApp com a mensagem pronta (o lojista só aperta enviar). */
function linkWhatsapp(c: Carrinho, loja: string) {
  const digitos = (c.telefone || '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const numero = digitos.startsWith('55') ? digitos : `55${digitos}`;
  const nome = c.cliente.trim().split(/\s+/)[0] || '';
  const texto = `Olá${nome ? `, ${nome}` : ''}! Aqui é da ${loja}. Vi que você não finalizou sua compra e separei seus itens de novo. É só tocar no link para concluir: ${c.link}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export default function CarrinhosAbandonadosPage() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const loja = getUser()?.store?.name || 'loja';

  const carregar = useCallback(async () => {
    try {
      setDados(await api<Resposta>('/admin/carrinhos-abandonados', opcoes()));
      setErro('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function alternarEmail(ligado: boolean) {
    if (!dados) return;
    setSalvando(true);
    try {
      await api('/admin/carrinhos-abandonados/config', {
        method: 'PATCH',
        body: { emailAutomatico: ligado },
        ...opcoes(),
      });
      setDados({ ...dados, emailAutomatico: ligado });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function copiar(c: Carrinho) {
    try {
      await navigator.clipboard.writeText(c.link);
      setCopiado(c.id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setCopiado(null);
    }
  }

  const taxa =
    dados && dados.total > 0
      ? Math.round((dados.recuperados / dados.total) * 100)
      : 0;

  return (
    <div className="admin-page max-w-4xl space-y-5">
      <div>
        <h1>Carrinhos abandonados</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Clientes que chegaram ao pagamento e não pagaram (o pedido expira em
          1 hora e os itens voltam para o estoque). Últimos 30 dias.
        </p>
      </div>

      {erro ? (
        <p className="border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-accent">
          {erro}
        </p>
      ) : null}

      {dados ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-muted">Abandonados</p>
              <p className="text-2xl font-bold">{dados.total}</p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-muted">Voltaram e compraram</p>
              <p className="text-2xl font-bold text-[var(--ok)]">
                {dados.recuperados}
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-muted">Recuperação</p>
              <p className="text-2xl font-bold">{taxa}%</p>
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={dados.emailAutomatico}
              disabled={salvando}
              onChange={(e) => void alternarEmail(e.target.checked)}
            />
            <span className="text-sm">
              <strong>Lembrete automático por e-mail</strong>
              <span className="block text-muted">
                Um e-mail só, assim que o pedido expira, com um botão que
                devolve os itens à sacola do cliente.
              </span>
            </span>
          </label>

          {dados.carrinhos.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-black/15 bg-white px-4 py-8 text-center text-sm text-muted">
              Nenhum carrinho abandonado nos últimos 30 dias.
            </p>
          ) : (
            <ul className="space-y-2">
              {dados.carrinhos.map((c) => {
                const wa = linkWhatsapp(c, loja);
                return (
                  <li
                    key={c.id}
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {c.cliente}{' '}
                          <span className="font-normal text-muted">
                            · {money(c.total)}
                          </span>
                        </p>
                        <p className="text-xs text-muted">
                          {c.email}
                          {c.telefone ? ` · ${c.telefone}` : ''} · abandonado{' '}
                          {quando(c.abandonadoEm)}
                        </p>
                        <p className="mt-1 text-sm">
                          {c.itens
                            .map((i) => `${i.quantidade}× ${i.nome}`)
                            .join(', ')}
                        </p>
                        <p className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                          {c.recuperadoNoPedido ? (
                            <span className="rounded-full bg-[#e3f4ea] px-2 py-0.5 text-[#1b7f45]">
                              Recuperado · pedido #{c.recuperadoNoPedido}
                            </span>
                          ) : null}
                          <span
                            className={`rounded-full px-2 py-0.5 ${
                              c.emailEnviadoEm
                                ? 'bg-[#eef0f4] text-muted'
                                : 'bg-[#fff5dc] text-[#7a5200]'
                            }`}
                          >
                            {c.emailEnviadoEm ? 'E-mail enviado' : 'E-mail não enviado'}
                          </span>
                        </p>
                      </div>
                      {!c.recuperadoNoPedido ? (
                        <div className="flex flex-wrap gap-2">
                          {wa ? (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-accent text-xs"
                            >
                              Chamar no WhatsApp
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-ghost text-xs"
                            onClick={() => void copiar(c)}
                          >
                            {copiado === c.id ? 'Link copiado' : 'Copiar link'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : !erro ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : null}
    </div>
  );
}
