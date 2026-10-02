'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { Modal } from '@/components/Modal';
import { useConfirm } from '@/components/ConfirmDialog';
import { CabecalhoPagina } from '@/components/admin/Pagina';

type Membro = {
  id: string;
  nome: string;
  email: string;
  dono: boolean;
  permissoes: string[];
  ativo: boolean;
  convitePendente: boolean;
  desde: string;
};

type Area = { id: string; nome: string };

type Resposta = {
  membros: Membro[];
  limite: number | null;
  emUso: number;
  areas: Area[];
};

type Edicao = { membro: Membro | null };

export default function EquipePage() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const { confirm, dialog } = useConfirm();

  const opts = useCallback(
    () => ({ token: getToken(), storeSlug: getUser()?.store?.slug }),
    [],
  );

  const carregar = useCallback(async () => {
    try {
      setDados(await api<Resposta>('/admin/equipe', opts()));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar');
    }
  }, [opts]);

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
        api(`/admin/equipe/${m.id}`, {
          ...opts(),
          method: 'PATCH',
          body: { ativo },
        }),
      ativo
        ? `${m.nome} pode entrar de novo.`
        : `${m.nome} não entra mais no painel.`,
    );
  }

  async function remover(m: Membro) {
    const sim = await confirm({
      title: `Remover ${m.nome}?`,
      message:
        'A pessoa perde o acesso na hora. Para chamá-la de novo, mande outro convite.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!sim) return;
    void acao(
      () => api(`/admin/equipe/${m.id}`, { ...opts(), method: 'DELETE' }),
      `${m.nome} saiu da equipe.`,
    );
  }

  function reenviar(m: Membro) {
    void acao(
      () =>
        api(`/admin/equipe/${m.id}/reenviar`, { ...opts(), method: 'POST' }),
      `Convite reenviado para ${m.email}.`,
    );
  }

  const nomeArea = (id: string) =>
    dados?.areas.find((a) => a.id === id)?.nome.split(',')[0] ?? id;
  const cheio =
    dados?.limite != null && dados.emUso >= dados.limite ? true : false;

  return (
    <div className="admin-page max-w-3xl space-y-5">
      {dialog}
      <CabecalhoPagina
        icone="/admin/equipe"
        titulo="Equipe"
        descricao={
          <>
            Chame quem ajuda na loja e escolha o que cada pessoa pode ver. Cada
            uma entra com o próprio e-mail e senha. Recebimentos, plano e a
            equipe ficam só com você.
          </>
        }
        acoes={
          <>
            <button
              className="btn btn-accent"
              disabled={!dados || cheio}
              onClick={() => setEdicao({ membro: null })}
            >
              Convidar pessoa
            </button>
          </>
        }
      />

      {dados ? (
        <p className="text-sm text-muted">
          {dados.limite == null ? (
            <>
              <strong className="text-ink">{dados.emUso}</strong>{' '}
              {dados.emUso === 1 ? 'pessoa' : 'pessoas'} no painel
            </>
          ) : (
            <>
              <strong className="text-ink">
                {dados.emUso} de {dados.limite}
              </strong>{' '}
              pessoas do seu plano, contando você.
              {cheio ? (
                <>
                  {' '}
                  <Link
                    href="/admin/settings/planos"
                    className="font-semibold text-ink underline-offset-2 hover:underline"
                  >
                    Ver planos com mais pessoas
                  </Link>
                </>
              ) : null}
            </>
          )}
        </p>
      ) : null}

      {erro ? (
        <p
          role="alert"
          className="border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-accent"
        >
          {erro}
        </p>
      ) : null}
      {aviso ? (
        <p className="border border-[#bfe3c8] bg-[#f0fbf3] px-3 py-2 text-sm text-[#166534]">
          {aviso}
        </p>
      ) : null}

      {dados ? (
        <ul className="divide-y divide-line overflow-hidden border border-line bg-white">
          {dados.membros.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  {m.nome}
                  {m.dono ? (
                    <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">
                      Dono
                    </span>
                  ) : null}
                  {!m.ativo ? (
                    <span className="ml-2 rounded-full bg-[#eef0f3] px-2 py-0.5 text-[11px] font-bold text-muted">
                      Desativado
                    </span>
                  ) : m.convitePendente ? (
                    <span className="ml-2 rounded-full bg-[#fff8e1] px-2 py-0.5 text-[11px] font-bold text-[#6b4f00]">
                      Convite enviado
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted">{m.email}</p>
                <p className="mt-1 text-xs text-muted">
                  {m.dono
                    ? 'Acesso a tudo'
                    : m.permissoes.map(nomeArea).join(' · ')}
                </p>
              </div>
              {!m.dono ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => setEdicao({ membro: m })}
                  >
                    Editar
                  </button>
                  {m.ativo && m.convitePendente ? (
                    <button
                      className="btn btn-ghost text-xs"
                      onClick={() => reenviar(m)}
                    >
                      Reenviar convite
                    </button>
                  ) : null}
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => ativar(m, !m.ativo)}
                  >
                    {m.ativo ? 'Desativar' : 'Reativar'}
                  </button>
                  <button
                    className="btn btn-ghost text-xs text-accent"
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
        <p className="text-sm text-muted">Carregando…</p>
      ) : null}

      {edicao && dados ? (
        <FormMembro
          membro={edicao.membro}
          areas={dados.areas}
          onClose={() => setEdicao(null)}
          onSalvo={async (msg) => {
            setEdicao(null);
            setErro('');
            setAviso(msg);
            await carregar();
          }}
        />
      ) : null}
    </div>
  );
}

function FormMembro({
  membro,
  areas,
  onClose,
  onSalvo,
}: {
  membro: Membro | null;
  areas: Area[];
  onClose: () => void;
  onSalvo: (msg: string) => Promise<void>;
}) {
  const [nome, setNome] = useState(membro?.nome ?? '');
  const [email, setEmail] = useState(membro?.email ?? '');
  const [permissoes, setPermissoes] = useState<string[]>(
    membro?.permissoes ?? ['pedidos'],
  );
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  function alternar(id: string) {
    setPermissoes((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
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
    const base = { token: getToken(), storeSlug: getUser()?.store?.slug };
    try {
      if (membro) {
        await api(`/admin/equipe/${membro.id}`, {
          ...base,
          method: 'PATCH',
          body: { name: nome.trim(), permissoes },
        });
        await onSalvo(`Acesso de ${nome.trim()} atualizado.`);
      } else {
        await api('/admin/equipe', {
          ...base,
          method: 'POST',
          body: { name: nome.trim(), email: email.trim(), permissoes },
        });
        await onSalvo(
          `Convite enviado para ${email.trim()}. O link vale por 7 dias.`,
        );
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal
      title={membro ? `Editar ${membro.nome}` : 'Convidar pessoa'}
      hint={
        membro
          ? 'A mudança vale na hora, sem a pessoa precisar sair e entrar.'
          : 'A pessoa recebe um e-mail para criar a própria senha. Você não vê nem escolhe a senha de ninguém.'
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
            <span className="text-sm font-semibold">E-mail</span>
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
            O que a pessoa pode ver
          </legend>
          <div className="mt-2 space-y-2">
            {areas.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-start gap-2.5 border border-line px-3 py-2.5 text-sm hover:bg-[#fafafa]"
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={permissoes.includes(a.id)}
                  onChange={() => alternar(a.id)}
                />
                <span>{a.nome}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Recebimentos do Mercado Pago, plano, taxas e a equipe ficam sempre
            só com você.
          </p>
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <button type="button" className="btn btn-ghost" data-modal-cancel>
            Cancelar
          </button>
          <button className="btn btn-accent" disabled={ocupado}>
            {ocupado ? 'Salvando…' : membro ? 'Salvar' : 'Enviar convite'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
