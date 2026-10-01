'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, AuthUser } from '@/lib/api';
import { getToken, getUser, saveSession } from '@/lib/auth';
import { AppAutenticador } from '@/components/AppAutenticador';

type Status = {
  ativo: boolean;
  obrigatorio: boolean;
  ativadoEm: string | null;
  codigosRecuperacaoRestantes: number;
};

type Etapa =
  | { tipo: 'status' }
  | { tipo: 'qr'; qrCode: string; chave: string }
  | { tipo: 'codigos'; codigos: string[] }
  | { tipo: 'desativar' }
  | { tipo: 'novosCodigos' };

function opcoes() {
  const user = getUser();
  return {
    token: getToken(),
    // O lojista passa pela guarda da loja; o Super Admin não tem loja
    storeSlug: user?.role === 'STORE_ADMIN' ? user.store?.slug : undefined,
  };
}

/**
 * Verificação em duas etapas da conta logada: ativar (QR code + primeiro
 * código), ver os códigos de recuperação, gerar novos e — para o lojista —
 * desativar.
 */
export function DoisFatores({ onAtivado }: { onAtivado?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'status' });
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [guardei, setGuardei] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setStatus(await api<Status>('/auth/2fa', opcoes()));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function limpar() {
    setCodigo('');
    setSenha('');
    setErro('');
  }

  async function iniciar() {
    setOcupado(true);
    limpar();
    try {
      const r = await api<{ qrCode: string; chave: string }>(
        '/auth/2fa/ativar',
        { method: 'POST', ...opcoes() },
      );
      setEtapa({ tipo: 'qr', ...r });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível começar');
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro('');
    try {
      const r = await api<{
        codigosRecuperacao: string[];
        accessToken: string;
        user: AuthUser;
      }>('/auth/2fa/confirmar', {
        method: 'POST',
        body: { codigo },
        ...opcoes(),
      });
      // A ativação encerra as sessões antigas; esta é a nova
      saveSession(r.accessToken, r.user);
      setGuardei(false);
      setEtapa({ tipo: 'codigos', codigos: r.codigosRecuperacao });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Código incorreto');
    } finally {
      setOcupado(false);
    }
  }

  async function desativar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro('');
    try {
      await api('/auth/2fa/desativar', {
        method: 'POST',
        body: { senha, codigo },
        ...opcoes(),
      });
      limpar();
      setEtapa({ tipo: 'status' });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível desativar');
    } finally {
      setOcupado(false);
    }
  }

  async function gerarNovos(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro('');
    try {
      const r = await api<{ codigosRecuperacao: string[] }>(
        '/auth/2fa/recuperacao',
        { method: 'POST', body: { codigo }, ...opcoes() },
      );
      limpar();
      setGuardei(false);
      setEtapa({ tipo: 'codigos', codigos: r.codigosRecuperacao });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Código incorreto');
    } finally {
      setOcupado(false);
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  const campoCodigo = (
    <div>
      <label className="label" htmlFor="codigo-app">
        Código de 6 dígitos do app
      </label>
      <input
        id="codigo-app"
        className="field h-12 max-w-[220px] text-center font-mono text-xl tracking-[0.3em]"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        required
      />
    </div>
  );

  const mensagemErro = erro ? (
    <p className="border border-accent/25 bg-accent/5 px-3 py-2 text-[13px] text-accent">
      {erro}
    </p>
  ) : null;

  if (!status) {
    return <p className="text-sm text-muted">{erro || 'Carregando...'}</p>;
  }

  // ---------- QR code ----------
  if (etapa.tipo === 'qr') {
    return (
      <form onSubmit={confirmar} className="space-y-5">
        <AppAutenticador />
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>
            Instale um app autenticador no celular:{' '}
            <strong className="text-ink">Google Authenticator</strong>,
            Microsoft Authenticator ou outro de sua preferência (todos são
            grátis).
          </li>
          <li>
            No app, toque em <strong className="text-ink">+</strong> e em{' '}
            <strong className="text-ink">Ler código QR</strong>.
          </li>
          <li>Aponte a câmera para o código abaixo.</li>
          <li>Digite o número de 6 dígitos que aparecer no app.</li>
        </ol>
        <div className="flex flex-wrap items-start gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={etapa.qrCode}
            alt="QR code para o app autenticador"
            width={200}
            height={200}
            className="border border-line bg-white p-2"
          />
          <div className="min-w-0 max-w-sm text-sm">
            <p className="text-muted">
              A câmera não lê? No app, escolha &quot;Inserir chave&quot; e
              digite:
            </p>
            <p className="mt-1 break-all font-mono text-[15px] font-semibold text-ink">
              {etapa.chave}
            </p>
          </div>
        </div>
        {campoCodigo}
        {mensagemErro}
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-accent"
            disabled={ocupado || codigo.length !== 6}
          >
            {ocupado ? 'Conferindo...' : 'Ativar'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              limpar();
              setEtapa({ tipo: 'status' });
            }}
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  // ---------- Códigos de recuperação ----------
  if (etapa.tipo === 'codigos') {
    const texto = etapa.codigos.join('\n');
    return (
      <div className="space-y-4">
        <p className="text-sm font-semibold text-[var(--ok)]">
          Verificação em duas etapas ativa.
        </p>
        <div className="border border-[#f0d998] bg-[#fff8e1] px-4 py-3 text-sm text-[#6b4f00]">
          <p className="font-semibold">Guarde estes códigos de recuperação</p>
          <p className="mt-1">
            Se perder o celular, cada código entra uma vez no lugar do app.
            Eles aparecem só agora: anote num papel ou salve no seu gerenciador
            de senhas.
          </p>
        </div>
        <ul className="grid max-w-md grid-cols-2 gap-x-6 gap-y-1.5 border border-line bg-white p-4 font-mono text-[15px]">
          {etapa.codigos.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void copiar(texto)}
          >
            {copiado ? 'Copiado' : 'Copiar códigos'}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={guardei}
              onChange={(e) => setGuardei(e.target.checked)}
            />
            Já guardei os códigos
          </label>
        </div>
        <button
          type="button"
          className="btn btn-accent"
          disabled={!guardei}
          onClick={() => {
            setEtapa({ tipo: 'status' });
            onAtivado?.();
          }}
        >
          Concluir
        </button>
      </div>
    );
  }

  // ---------- Desativar (lojista) ----------
  if (etapa.tipo === 'desativar') {
    return (
      <form onSubmit={desativar} className="space-y-4">
        <p className="text-sm text-muted">
          Para desligar, confirme a senha e um código do app.
        </p>
        <div>
          <label className="label" htmlFor="senha-2fa">
            Senha
          </label>
          <input
            id="senha-2fa"
            type="password"
            className="field max-w-sm"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {campoCodigo}
        {mensagemErro}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost text-accent" disabled={ocupado}>
            {ocupado ? 'Desligando...' : 'Desligar verificação'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              limpar();
              setEtapa({ tipo: 'status' });
            }}
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  // ---------- Novos códigos de recuperação ----------
  if (etapa.tipo === 'novosCodigos') {
    return (
      <form onSubmit={gerarNovos} className="space-y-4">
        <p className="text-sm text-muted">
          Os códigos de recuperação antigos deixam de valer. Confirme com um
          código do app.
        </p>
        {campoCodigo}
        {mensagemErro}
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-accent"
            disabled={ocupado || codigo.length !== 6}
          >
            {ocupado ? 'Gerando...' : 'Gerar novos códigos'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              limpar();
              setEtapa({ tipo: 'status' });
            }}
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  // ---------- Situação ----------
  return (
    <div className="space-y-4">
      {status.ativo ? (
        <>
          <p className="text-sm">
            <span className="font-semibold text-[var(--ok)]">Ativa</span>
            {status.ativadoEm
              ? ` desde ${new Date(status.ativadoEm).toLocaleDateString('pt-BR')}`
              : ''}
            . Para entrar, além da senha, é pedido o código do app.
          </p>
          <p
            className={`text-sm ${
              status.codigosRecuperacaoRestantes <= 3
                ? 'font-semibold text-accent'
                : 'text-muted'
            }`}
          >
            Códigos de recuperação restantes: {status.codigosRecuperacaoRestantes}
            {status.codigosRecuperacaoRestantes <= 3
              ? ' — gere novos para não ficar sem.'
              : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                limpar();
                setEtapa({ tipo: 'novosCodigos' });
              }}
            >
              Gerar novos códigos de recuperação
            </button>
            {!status.obrigatorio ? (
              <button
                type="button"
                className="btn btn-ghost text-accent"
                onClick={() => {
                  limpar();
                  setEtapa({ tipo: 'desativar' });
                }}
              >
                Desligar
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            {status.obrigatorio
              ? 'Obrigatória para quem administra a plataforma. Ative para liberar o painel.'
              : 'Opcional. Com ela ligada, quem descobrir a sua senha ainda não entra no painel: é preciso também o código que aparece no seu celular.'}
          </p>
          <AppAutenticador />
          {mensagemErro}
          <button
            type="button"
            className="btn btn-accent"
            disabled={ocupado}
            onClick={() => void iniciar()}
          >
            {ocupado ? 'Gerando QR code...' : 'Ativar verificação em duas etapas'}
          </button>
        </>
      )}
    </div>
  );
}
