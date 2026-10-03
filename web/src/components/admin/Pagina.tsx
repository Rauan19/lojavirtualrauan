import type { ReactNode } from 'react';
import { IconeMenu } from '@/components/admin/IconeMenu';

/*
 * Peças das páginas do painel (padrão Nuvemshop), para todas as telas terem
 * a mesma cara: cabeçalho com ícone, título e ações; seções em cartão;
 * estados vazios que dizem o próximo passo; selos de status.
 */

/** Topo da página: ícone da área, título, descrição e ações à direita. */
export function CabecalhoPagina({
  titulo,
  descricao,
  icone,
  acoes,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  /** Endereço da tela no menu (usa o mesmo ícone do menu lateral) */
  icone?: string;
  acoes?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3.5">
        {icone ? (
          <span
            className="mt-0.5 hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e9f1f3] text-[var(--brand-deep)] sm:flex"
            aria-hidden
          >
            <IconeMenu href={icone} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1>{titulo}</h1>
          {descricao ? (
            <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-muted">
              {descricao}
            </p>
          ) : null}
        </div>
      </div>
      {acoes ? (
        <div className="flex flex-wrap items-center gap-2">{acoes}</div>
      ) : null}
    </div>
  );
}

/** Bloco da página em cartão branco, com título opcional. */
export function Secao({
  titulo,
  descricao,
  acoes,
  children,
  semRespiro = false,
  className = '',
}: {
  titulo?: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  /** Conteúdo encosta nas bordas (tabelas e listas) */
  semRespiro?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-line bg-white ${className}`}
    >
      {titulo || acoes ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {titulo ? (
              <h2 className="text-[15px] font-bold">{titulo}</h2>
            ) : null}
            {descricao ? (
              <p className="mt-0.5 text-[13px] text-muted">{descricao}</p>
            ) : null}
          </div>
          {acoes ? (
            <div className="flex flex-wrap items-center gap-2">{acoes}</div>
          ) : null}
        </div>
      ) : null}
      <div className={semRespiro ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

/** Lista vazia: diz o que aparece aqui e o próximo passo. */
export function EstadoVazio({
  icone,
  titulo,
  texto,
  acao,
}: {
  icone?: string;
  titulo: ReactNode;
  texto?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icone ? (
        <span
          className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e9f1f3] text-[var(--brand-deep)]"
          aria-hidden
        >
          <IconeMenu href={icone} />
        </span>
      ) : null}
      <p className="text-[15px] font-semibold text-ink">{titulo}</p>
      {texto ? (
        <p className="mt-1 max-w-md text-sm text-muted">{texto}</p>
      ) : null}
      {acao ? <div className="mt-4">{acao}</div> : null}
    </div>
  );
}

const TONS = {
  ok: 'bg-[#e8f6ee] text-[#166534]',
  alerta: 'bg-[#fff6e0] text-[#8a5a00]',
  erro: 'bg-[#fdecee] text-[#b42318]',
  info: 'bg-[#e9f1f3] text-[var(--brand-deep)]',
  neutro: 'bg-[#f1f2f4] text-[#4a5560]',
} as const;

/** Selo de status em pílula. */
export function Selo({
  tom = 'neutro',
  children,
}: {
  tom?: keyof typeof TONS;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${TONS[tom]}`}
    >
      {children}
    </span>
  );
}
