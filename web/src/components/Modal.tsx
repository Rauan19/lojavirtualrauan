'use client';

import { useState, type ReactNode } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { useEscapeKey, useUnsavedWarning } from '@/lib/modal-guards';

/**
 * Caixa de edição padrão dos painéis (lojista e Super Admin).
 *
 * - X, Esc e qualquer botão com `data-modal-cancel` fecham; se algum campo
 *   foi mexido e não foi salvo, pergunta antes ("Fechar sem salvar?").
 * - Recarregar a página com alteração pendente mostra o aviso do navegador.
 * - Clicar fora não fecha: perder um formulário inteiro por um clique errado
 *   é pior do que um clique a mais no X.
 * - `erro` aparece dentro do modal (a mensagem da página fica escondida atrás).
 */
export function Modal({
  title,
  hint,
  erro,
  onClose,
  largura = 'md',
  children,
}: {
  title: string;
  hint?: string;
  erro?: string;
  onClose: () => void;
  largura?: 'md' | 'lg';
  children: ReactNode;
}) {
  const [mexeu, setMexeu] = useState(false);
  const { confirm, dialog } = useConfirm();

  async function fechar() {
    if (
      mexeu &&
      !(await confirm({
        title: 'Fechar sem salvar?',
        message: 'O que você mudou aqui ainda não foi salvo.',
        confirmLabel: 'Fechar sem salvar',
        cancelLabel: 'Continuar editando',
        danger: true,
      }))
    ) {
      return;
    }
    onClose();
  }

  useEscapeKey(true, () => void fechar());
  useUnsavedWarning(mexeu);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onInputCapture={() => setMexeu(true)}
      onChangeCapture={() => setMexeu(true)}
      onSubmitCapture={() => setMexeu(false)}
      onClickCapture={(e) => {
        const alvo = e.target as HTMLElement;
        if (alvo.closest('[data-modal-cancel]')) {
          e.preventDefault();
          e.stopPropagation();
          void fechar();
        }
      }}
    >
      {dialog}
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden border border-line bg-white shadow-xl sm:rounded-md ${
          largura === 'lg' ? 'max-w-3xl' : 'max-w-xl'
        }`}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">{title}</h2>
            {hint ? (
              <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-btn shrink-0"
            onClick={() => void fechar()}
            aria-label="Fechar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {erro ? (
          <p role="alert" className="mx-4 mt-3 border border-[#f3b3b3] bg-[#fef2f2] px-3 py-2 text-sm text-accent">
            {erro}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
