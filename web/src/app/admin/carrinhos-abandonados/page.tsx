'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, money } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { CabecalhoPagina, EstadoVazio, Selo } from '@/components/admin/Pagina';

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
    <div className="admin-page max-w-5xl">
      <CabecalhoPagina
        icone="/admin/carrinhos-abandonados"
        titulo="Carrinhos abandonados"
        descricao="Clientes que chegaram ao pagamento e não pagaram (o pedido expira em 1 hora e os itens voltam para o estoque). Últimos 30 dias."
      />

      {erro ? (
        <p role="alert" className="border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-accent">
          {erro}
        </p>
      ) : null}

      {dados ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['Abandonados', String(dados.total), ''],
                ['Voltaram e compraram', String(dados.recuperados), 'text-[var(--ok)]'],
                ['Recuperação', `${taxa}%`, ''],
              ] as const
            ).map(([rotulo, valor, cor]) => (
              <div key={rotulo} className="rounded-2xl border border-line bg-white px-5 py-4">
                <p className="text-[13px] text-muted">{rotulo}</p>
                <p className={`mt-0.5 text-[26px] font-bold leading-tight tabular-nums ${cor}`}>{valor}</p>
              </div>
            ))}
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-line bg-white px-5 py-4">
            <span className="text-sm">
              <strong className="block text-[15px]">Lembrete automático por e-mail</strong>
              <span className="text-muted">
                Um e-mail só, assim que o pedido expira, com um botão que devolve
                os itens à sacola do cliente.
              </span>
            </span>
            <span className="relative inline-flex shrink-0">
              <input
                type="checkbox"
                role="switch"
                className="peer sr-only"
                checked={dados.emailAutomatico}
                disabled={salvando}
                onChange={(e) => void alternarEmail(e.target.checked)}
              />
              <span className="h-7 w-12 rounded-full bg-[#d5dade] transition-colors peer-checked:bg-[var(--brand-deep)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--brand-teal)] peer-disabled:opacity-60" />
              <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            </span>
          </label>

          {dados.carrinhos.length === 0 ? (
            <div className="rounded-2xl border border-line bg-white">
              <EstadoVazio
                icone="/admin/carrinhos-abandonados"
                titulo="Nenhum carrinho abandonado"
                texto="Nos últimos 30 dias ninguém deixou de pagar. Quando acontecer, o pedido aparece aqui para você chamar o cliente."
              />
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
              {dados.carrinhos.map((c) => {
                const wa = linkWhatsapp(c, loja);
                return (
                  <li key={c.id} className="px-5 py-4">
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
                        <p className="mt-2 flex flex-wrap gap-1.5">
                          {c.recuperadoNoPedido ? (
                            <Selo tom="ok">Recuperado · pedido #{c.recuperadoNoPedido}</Selo>
                          ) : null}
                          <Selo tom={c.emailEnviadoEm ? 'neutro' : 'alerta'}>
                            {c.emailEnviadoEm ? 'E-mail enviado' : 'E-mail não enviado'}
                          </Selo>
                        </p>
                      </div>
                      {!c.recuperadoNoPedido ? (
                        <div className="flex flex-wrap gap-2">
                          {wa ? (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-accent h-9 px-3 text-[13px]"
                            >
                              Chamar no WhatsApp
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-ghost h-9 px-3 text-[13px]"
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
        <p className="text-sm text-muted">Carregando…</p>
      ) : null}
    </div>
  );
}
