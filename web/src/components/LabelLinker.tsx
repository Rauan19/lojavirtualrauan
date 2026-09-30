'use client';

import { useEffect } from 'react';

const CONTROLE = 'input:not([type="hidden"]), select, textarea';
let seq = 0;

/**
 * Liga cada `<label class="label">` ao campo logo abaixo dele.
 *
 * Os formulários do sistema escrevem o rótulo e o campo lado a lado, sem
 * `htmlFor`/`id` (são ~140 campos). Sem essa ligação, clicar no nome do campo
 * não põe o cursor nele, e o leitor de tela não sabe o nome do campo.
 *
 * Em vez de editar campo por campo, isto faz a ligação no navegador — também
 * nos modais, que aparecem depois (MutationObserver). Rótulo que já tem
 * `htmlFor` ou que envolve o próprio campo fica como está.
 */
export function LabelLinker() {
  useEffect(() => {
    const ligar = (raiz: ParentNode) => {
      raiz.querySelectorAll<HTMLLabelElement>('label.label').forEach((label) => {
        if (label.htmlFor || label.querySelector(CONTROLE)) return;

        // O campo é o próximo irmão; se o irmão for um bloco, o primeiro campo dentro dele
        let alvo: Element | null = null;
        for (let el = label.nextElementSibling; el && !alvo; el = el.nextElementSibling) {
          if (el.matches('label')) break;
          alvo = el.matches(CONTROLE) ? el : el.querySelector(CONTROLE);
        }
        if (!alvo) return;

        if (!alvo.id) alvo.id = `campo-${++seq}`;
        label.htmlFor = alvo.id;
      });
    };

    ligar(document);
    const obs = new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === Node.ELEMENT_NODE) ligar(n.parentNode ?? (n as Element));
        });
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  return null;
}
