'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import {
  chaveEmBytes,
  ehIphone,
  inscricaoAtual,
  instalado,
  nomeDoAparelho,
  pushSuportado,
  registroDoPainel,
} from '@/lib/avisos';

type Painel = {
  disponivel: boolean;
  chavePublica: string | null;
  aparelhos: { id: string; nome: string; desde: string; endpoint: string }[];
};

type PedidoDeInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function AvisosPage() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [esteAparelho, setEsteAparelho] = useState<string | null>(null);
  const [permissao, setPermissao] = useState<NotificationPermission | null>(
    null,
  );
  const [suporte, setSuporte] = useState(true);
  const [iphoneSemInstalar, setIphoneSemInstalar] = useState(false);
  const [instalar, setInstalar] = useState<PedidoDeInstalacao | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const opts = useCallback(
    () => ({ token: getToken(), storeSlug: getUser()?.store?.slug }),
    [],
  );

  const carregar = useCallback(async () => {
    try {
      setPainel(await api<Painel>('/admin/avisos', opts()));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar');
    }
    const sub = await inscricaoAtual().catch(() => null);
    setEsteAparelho(sub?.endpoint ?? null);
  }, [opts]);

  useEffect(() => {
    setSuporte(pushSuportado());
    setIphoneSemInstalar(ehIphone() && !instalado());
    if ('Notification' in window) setPermissao(Notification.permission);
    void carregar();
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstalar(e as PedidoDeInstalacao);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [carregar]);

  async function ligar() {
    if (!painel?.chavePublica) return;
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      const p = await Notification.requestPermission();
      setPermissao(p);
      if (p !== 'granted') {
        setErro(
          'O navegador não deixou mostrar avisos. Libere as notificações deste site nas configurações do navegador e tente de novo.',
        );
        return;
      }
      const reg = await registroDoPainel();
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: chaveEmBytes(painel.chavePublica),
        }));
      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      setPainel(
        await api<Painel>('/admin/avisos/inscrever', {
          ...opts(),
          method: 'POST',
          body: {
            endpoint: json.endpoint,
            keys: json.keys,
            device: nomeDoAparelho(),
          },
        }),
      );
      setEsteAparelho(sub.endpoint);
      setAviso('Pronto! Este aparelho vai avisar cada venda.');
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : 'Não foi possível ligar os avisos',
      );
    } finally {
      setOcupado(false);
    }
  }

  async function desligar(endpoint: string) {
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      if (endpoint === esteAparelho) {
        const sub = await inscricaoAtual();
        await sub?.unsubscribe();
        setEsteAparelho(null);
      }
      setPainel(
        await api<Painel>('/admin/avisos/inscrever', {
          ...opts(),
          method: 'DELETE',
          body: { endpoint },
        }),
      );
      setAviso('Avisos desligados.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível desligar');
    } finally {
      setOcupado(false);
    }
  }

  async function testar() {
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      const r = await api<{ enviados: number }>('/admin/avisos/teste', {
        ...opts(),
        method: 'POST',
      });
      setAviso(
        r.enviados > 0
          ? 'Aviso de teste enviado. Deve aparecer em alguns segundos.'
          : 'Nenhum aparelho recebeu. Desligue e ligue os avisos de novo.',
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar');
    } finally {
      setOcupado(false);
    }
  }

  async function instalarPainel() {
    if (!instalar) return;
    await instalar.prompt();
    await instalar.userChoice.catch(() => undefined);
    setInstalar(null);
  }

  const ligadoAqui = Boolean(
    esteAparelho && painel?.aparelhos.some((a) => a.endpoint === esteAparelho),
  );

  return (
    <div className="admin-page max-w-2xl space-y-5">
      <div>
        <h1>Avisos no celular</h1>
        <p className="mt-1 text-sm text-muted">
          Receba &quot;Você vendeu!&quot; na hora em que um pagamento é
          aprovado, mesmo com o painel fechado. Ligue em cada aparelho que você
          usa. Grátis, sem instalar app de loja.
        </p>
      </div>

      {erro ? (
        <p role="alert" className="border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-accent">
          {erro}
        </p>
      ) : null}
      {aviso ? (
        <p className="border border-[#bfe3c8] bg-[#f0fbf3] px-3 py-2 text-sm text-[#166534]">
          {aviso}
        </p>
      ) : null}

      <section className="border border-line bg-white px-4 py-4">
        <h2 className="text-sm font-bold">Este aparelho</h2>
        {!painel ? (
          <p className="mt-2 text-sm text-muted">Carregando…</p>
        ) : !painel.disponivel ? (
          <p className="mt-2 text-sm text-muted">
            Os avisos no celular ainda não foram ligados na plataforma.
          </p>
        ) : iphoneSemInstalar ? (
          <div className="mt-2 space-y-2 text-sm">
            <p>
              No iPhone, os avisos só funcionam com o painel na tela de início:
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>
                Abra esta página no <strong className="text-ink">Safari</strong>
                .
              </li>
              <li>
                Toque em <strong className="text-ink">Compartilhar</strong>{' '}
                (o quadrado com a seta para cima).
              </li>
              <li>
                Escolha{' '}
                <strong className="text-ink">Adicionar à Tela de Início</strong>
                .
              </li>
              <li>
                Abra o painel pelo ícone novo e volte aqui em Avisos no
                celular.
              </li>
            </ol>
          </div>
        ) : !suporte ? (
          <p className="mt-2 text-sm text-muted">
            Este navegador não recebe avisos. No celular, use o Chrome (Android)
            ou o Safari com o painel na tela de início (iPhone).
          </p>
        ) : ligadoAqui ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="mr-auto text-sm font-semibold text-[#166534]">
              Avisos ligados neste aparelho
            </span>
            <button
              className="btn btn-ghost"
              disabled={ocupado}
              onClick={() => void testar()}
            >
              Enviar aviso de teste
            </button>
            <button
              className="btn btn-ghost"
              disabled={ocupado}
              onClick={() => esteAparelho && void desligar(esteAparelho)}
            >
              Desligar
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            {permissao === 'denied' ? (
              <p className="text-sm text-accent">
                As notificações deste site estão bloqueadas no navegador. Toque
                no cadeado ao lado do endereço, libere Notificações e recarregue
                a página.
              </p>
            ) : (
              <p className="text-sm text-muted">
                O navegador vai perguntar se pode mostrar notificações: toque em
                Permitir.
              </p>
            )}
            <button
              className="btn btn-accent"
              disabled={ocupado || permissao === 'denied'}
              onClick={() => void ligar()}
            >
              {ocupado ? 'Ligando…' : 'Ligar avisos neste aparelho'}
            </button>
          </div>
        )}

        {instalar ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <p className="text-sm text-muted">
              Coloque o painel na tela inicial para abrir como um app.
            </p>
            <button
              className="btn btn-ghost"
              onClick={() => void instalarPainel()}
            >
              Instalar o painel
            </button>
          </div>
        ) : null}
      </section>

      {painel && painel.aparelhos.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-bold">Seus aparelhos com avisos</h2>
          <ul className="divide-y divide-line border border-line bg-white">
            {painel.aparelhos.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {a.nome}
                    {a.endpoint === esteAparelho ? (
                      <span className="ml-2 text-xs font-normal text-muted">
                        (este)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    desde {new Date(a.desde).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <button
                  className="btn btn-ghost text-xs"
                  disabled={ocupado}
                  onClick={() => void desligar(a.endpoint)}
                >
                  Desligar
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
