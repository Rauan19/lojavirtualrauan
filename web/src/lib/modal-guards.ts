'use client';

import { useEffect, useRef } from 'react';

/**
 * Esc fecha o modal (chamando `onEscape`, que pode perguntar antes de
 * descartar). Ignora a tecla quando o popup de confirmação está aberto — ele
 * mesmo trata o Esc, e fechar os dois de uma vez perderia o formulário.
 */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[data-confirm-dialog]')) return;
      handler.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

/**
 * Aviso do navegador ao recarregar ou fechar a aba com alteração não salva.
 * O texto é do próprio navegador (não dá para trocar), mas a pergunta aparece.
 */
export function useUnsavedWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome antigo só mostra o aviso com returnValue preenchido
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);
}
