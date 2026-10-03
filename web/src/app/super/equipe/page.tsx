'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { Modal } from '@/components/Modal';
import { useConfirm } from '@/components/ConfirmDialog';
import { CabecalhoPagina, Secao, Selo } from '@/components/admin/Pagina';

type Membro = {
  id: string;
  name: string;
  email: string;
  dono: boolean;
  permissoes: string[] | null;
  ativo: boolean;
  senhaProvisoria: boolean;
  doisFatores: boolean;
  createdAt: string;
};

type Area = { chave: string; descricao: string };

type Resposta = { membros: Membro[]; areas: Area[] };

type Atividade = {
  id: string;
  userEmail: string;
  method: string;
  path: string;
  status: number;
  createdAt: string;
};

type Edicao = { membro: Membro | null };

/** Senha provisória legível (sem 0/O, 1/l), para ditar ou mandar no WhatsApp. */
function gerarSenha() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => letras[b % letras.length]).join('');
}

/** "Quem fez o quê" em português, a partir do método e da rota. */
function descrever(a: Atividade) {
  const p = a.path.replace(/^\/api/, '');
  const m = a.method;
  const regras: [RegExp, string, string?][] = [
    [/^\/stores$/, 'Criou uma loja', 'POST'],
    [/^\/stores\/[^/]+\/status$/, 'Mudou o status de uma loja'],
    [/^\/stores\/[^/]+$/, 'Editou os dados de uma loja', 'PATCH'],
    [/^\/billing\/platform\/plans$/, 'Criou um plano', 'POST'],
    [/^\/billing\/platform\/plans\/[^/]+$/, 'Editou um plano', 'PATCH'],
    [/^\/billing\/platform\/plans\/[^/]+$/, 'Excluiu um plano', 'DELETE'],
    [/^\/billing\/platform\/general$/, 'Mudou o teste grátis e a cobrança'],
    [
      /^\/billing\/platform\/mercadopago/,
      'Mexeu no Mercado Pago da plataforma',
    ],
    [/^\/platform-fee\/lojas\//, 'Mudou a comissão de uma loja'],
    [/^\/platform-fee\/divergencias\//, 'Resolveu uma divergência de comissão'],
    [/^\/super\/templates\/[^/]+\/cortesia$/, 'Deu um template de cortesia'],
    [/^\/super\/templates$/, 'Criou um template', 'POST'],
    [/^\/super\/templates\/[^/]+$/, 'Editou um template', 'PATCH'],
    [/^\/super\/templates\/[^/]+$/, 'Excluiu um template', 'DELETE'],
    [/^\/super\/equipe$/, 'Adicionou alguém à equipe', 'POST'],
    [/^\/super\/equipe\/[^/]+$/, 'Mudou o acesso de alguém da equipe', 'PATCH'],
    [/^\/super\/equipe\/[^/]+$/, 'Removeu alguém da equipe', 'DELETE'],
  ];
  const r = regras.find(([re, , so]) => (!so || so === m) && re.test(p));
  return r ? r[1] : `${m} ${p}`;
}

function quando(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SuperEquipePage() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [atividade, setAtividade] = useState<Atividade[] | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  /** Senha provisória recém-definida: aparece uma vez para o dono copiar */
  const [senhaParaPassar, setSenhaParaPassar] = useState<{
    nome: string;
    email: string;
    senha: string;
  } | null>(null);
  const { confirm, dialog } = useConfirm();

  const carregar = useCallback(async () => {
    const token = getToken();
    try {
      const [d, a] = await Promise.all([
        api<Resposta>('/super/equipe', { token }),
        api<Atividade[]>('/super/equipe/atividade?limite=60', { token }),
      ]);
      setDados(d);
      setAtividade(a);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function acao(fn: () => Promise<unknown>, ok: string) {
    setErro('');
    setAviso('');
    try {
      await fn();
      setAviso(ok);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar');
    }
  }

  function ativar(m: Membro, ativo: boolean) {
    void acao(
      () =>
        api(`/super/equipe/${m.id}`, {
          token: getToken(),
          method: 'PATCH',
          body: { ativo },
        }),
      ativo
        ? `${m.name} pode entrar de novo.`
        : `${m.name} saiu do painel na hora e não entra mais.`,
    );
  }

  async function novaSenha(m: Membro) {
    const sim = await confirm({
      title: `Gerar senha provisória para ${m.name}?`,
      message:
        'A senha atual deixa de valer e a pessoa sai do painel. No próximo acesso ela entra com a senha provisória e cria uma nova.',
      confirmLabel: 'Gerar senha',
    });
    if (!sim) return;
    const senha = gerarSenha();
    setErro('');
    try {
      await api(`/super/equipe/${m.id}`, {
        token: getToken(),
        method: 'PATCH',
        body: { senhaProvisoria: senha },
      });
      setSenhaParaPassar({ nome: m.name, email: m.email, senha });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar');
    }
  }

  async function remover(m: Membro) {
    const sim = await confirm({
      title: `Remover ${m.name}?`,
      message:
        'A pessoa perde o acesso na hora. O que ela fez continua no registro de atividade.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!sim) return;
    void acao(
      () =>
        api(`/super/equipe/${m.id}`, { token: getToken(), method: 'DELETE' }),
      `${m.name} saiu da equipe.`,
    );
  }

  const nomeArea = (chave: string) =>
    dados?.areas.find((a) => a.chave === chave)?.descricao.split(':')[0] ??
    chave;

  return (
    <div className="admin-page max-w-4xl space-y-5">
      {dialog}
      <CabecalhoPagina
        icone="/super/equipe"
        titulo="Equipe"
        descricao="Quem ajuda a cuidar da plataforma, e o que cada pessoa pode ver e mudar. Mercado Pago da plataforma e a equipe ficam só com você."
        acoes={
          <button
            className="btn btn-accent"
            disabled={!dados}
            onClick={() => setEdicao({ membro: null })}
          >
            Adicionar pessoa
          </button>
        }
      />

      {erro ? (
        <p
          role="alert"
          className="rounded-lg border border-[#f5c2c7] bg-[#fdecee] px-3 py-2 text-sm text-[#b42318]"
        >
          {erro}
        </p>
      ) : null}
      {aviso ? (
        <p className="rounded-lg border border-[#bfe3c8] bg-[#f0fbf3] px-3 py-2 text-sm text-[#166534]">
          {aviso}
        </p>
      ) : null}

      {senhaParaPassar ? (
        <Secao
          titulo={`Senha provisória de ${senhaParaPassar.nome}`}
          descricao="Passe para a pessoa por um canal seu (WhatsApp, pessoalmente). Ela só aparece agora: no primeiro acesso a pessoa troca por uma senha dela e ativa a verificação em duas etapas."
        >
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg border border-line bg-[#f7f8fa] px-3 py-2 font-mono text-[15px] tracking-wide">
              {senhaParaPassar.senha}
            </code>
            <button
              className="btn btn-ghost text-sm"
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(
                    `Acesso ao painel da Vendira\nE-mail: ${senhaParaPassar.email}\nSenha provisória: ${senhaParaPassar.senha}\n${window.location.origin}/login`,
                  )
                  .then(() => setAviso('Dados de acesso copiados.'))
              }
            >
              Copiar dados de acesso
            </button>
            <button
              className="btn btn-ghost text-sm"
              onClick={() => setSenhaParaPassar(null)}
            >
              Já passei
            </button>
          </div>
        </Secao>
      ) : null}

      <Secao semRespiro>
        {dados ? (
          <ul className="divide-y divide-line">
            {dados.membros.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {m.name}
                    {m.dono ? <Selo tom="info">Dono</Selo> : null}
                    {!m.ativo ? (
                      <Selo>Desativado</Selo>
                    ) : m.senhaProvisoria ? (
                      <Selo tom="alerta">Ainda não entrou</Selo>
                    ) : !m.doisFatores ? (
                      <Selo tom="alerta">Sem verificação em 2 etapas</Selo>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted">{m.email}</p>
                  <p className="mt-1 text-xs text-muted">
                    {m.dono
                      ? 'Acesso a tudo'
                      : (m.permissoes ?? []).map(nomeArea).join(' · ')}
                  </p>
                </div>
                {!m.dono ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn btn-ghost text-xs"
                      onClick={() => setEdicao({ membro: m })}
                    >
                      Editar acesso
                    </button>
                    <button
                      className="btn btn-ghost text-xs"
                      onClick={() => void novaSenha(m)}
                    >
                      Nova senha provisória
                    </button>
                    <button
                      className="btn btn-ghost text-xs"
                      onClick={() => ativar(m, !m.ativo)}
                    >
                      {m.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                    <button
                      className="btn btn-ghost text-xs text-[#b42318]"
                      onClick={() => void remover(m)}
                    >
                      Remover
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : !erro ? (
          <p className="px-4 py-3 text-sm text-muted">Carregando…</p>
        ) : null}
      </Secao>

      <Secao
        titulo="Atividade recente"
        descricao="Toda alteração feita no Super Admin, por quem fez. Só ações que mudam algo; consultas não entram."
        semRespiro
      >
        {atividade && atividade.length > 0 ? (
          <ul className="divide-y divide-line">
            {atividade.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-semibold">{descrever(a)}</span>
                  {a.status >= 400 ? (
                    <span className="ml-2 text-xs font-semibold text-[#b42318]">
                      (não concluiu)
                    </span>
                  ) : null}
                  <span className="block truncate text-xs text-muted">
                    {a.userEmail}
                  </span>
                </span>
                <time
                  dateTime={a.createdAt}
                  className="shrink-0 text-xs tabular-nums text-muted"
                >
                  {quando(a.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        ) : atividade ? (
          <p className="px-4 py-3 text-sm text-muted">
            Nada alterado ainda. Assim que alguém mudar algo, aparece aqui.
          </p>
        ) : null}
      </Secao>

      {edicao && dados ? (
        <FormColaborador
          membro={edicao.membro}
          areas={dados.areas}
          onClose={() => setEdicao(null)}
          onSalvo={async (msg, senha) => {
            setEdicao(null);
            setErro('');
            setAviso(msg);
            if (senha) setSenhaParaPassar(senha);
            await carregar();
          }}
        />
      ) : null}
    </div>
  );
}

function FormColaborador({
  membro,
  areas,
  onClose,
  onSalvo,
}: {
  membro: Membro | null;
  areas: Area[];
  onClose: () => void;
  onSalvo: (
    msg: string,
    senha?: { nome: string; email: string; senha: string },
  ) => Promise<void>;
}) {
  const [nome, setNome] = useState(membro?.name ?? '');
  const [email, setEmail] = useState(membro?.email ?? '');
  const [senha] = useState(() => (membro ? '' : gerarSenha()));
  const [permissoes, setPermissoes] = useState<string[]>(
    membro?.permissoes ?? ['lojas'],
  );
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  function alternar(chave: string) {
    setPermissoes((p) =>
      p.includes(chave) ? p.filter((x) => x !== chave) : [...p, chave],
    );
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (permissoes.length === 0) {
      setErro('Escolha pelo menos uma área.');
      return;
    }
    setOcupado(true);
    setErro('');
    const token = getToken();
    try {
      if (membro) {
        await api(`/super/equipe/${membro.id}`, {
          token,
          method: 'PATCH',
          body: { name: nome.trim(), permissoes },
        });
        await onSalvo(`Acesso de ${nome.trim()} atualizado. Já vale.`);
      } else {
        await api('/super/equipe', {
          token,
          method: 'POST',
          body: {
            name: nome.trim(),
            email: email.trim(),
            senhaProvisoria: senha,
            permissoes,
          },
        });
        await onSalvo(`${nome.trim()} entrou na equipe.`, {
          nome: nome.trim(),
          email: email.trim(),
          senha,
        });
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal
      title={membro ? `Acesso de ${membro.name}` : 'Adicionar pessoa'}
      hint={
        membro
          ? 'A mudança vale na hora, sem a pessoa precisar sair e entrar.'
          : 'A Vendira cria uma senha provisória para você passar à pessoa. No primeiro acesso ela troca por uma senha dela e ativa a verificação em duas etapas.'
      }
      erro={erro}
      onClose={onClose}
    >
      <form onSubmit={salvar} className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold">Nome</span>
          <input
            className="field mt-1 w-full"
            required
            minLength={2}
            maxLength={80}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </label>
        {membro ? (
          <p className="text-sm text-muted">
            E-mail: <strong className="text-ink">{membro.email}</strong>
          </p>
        ) : (
          <label className="block">
            <span className="text-sm font-semibold">E-mail de acesso</span>
            <input
              type="email"
              className="field mt-1 w-full"
              required
              maxLength={160}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}
        <fieldset>
          <legend className="text-sm font-semibold">
            O que a pessoa pode ver e mudar
          </legend>
          <div className="mt-2 space-y-2">
            {areas.map((a) => {
              const [titulo, detalhe] = a.descricao.split(': ');
              return (
                <label
                  key={a.chave}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm hover:bg-[#fafafa]"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={permissoes.includes(a.chave)}
                    onChange={() => alternar(a.chave)}
                  />
                  <span>
                    <span className="font-semibold">{titulo}</span>
                    {detalhe ? (
                      <span className="block text-xs text-muted">
                        {detalhe}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            Mercado Pago da plataforma e a equipe ficam sempre só com você.
          </p>
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <button type="button" className="btn btn-ghost" data-modal-cancel>
            Cancelar
          </button>
          <button className="btn btn-accent" disabled={ocupado}>
            {ocupado ? 'Salvando…' : membro ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
