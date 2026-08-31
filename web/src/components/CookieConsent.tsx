'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/*
 * Consentimento de cookies.
 *
 * Só aparece quando a loja tem medição de audiência configurada. Sem GA nem
 * Pixel, a vitrine usa apenas cookie essencial de sessão — que a LGPD dispensa
 * de consentimento (art. 7º, V: execução do contrato). Mostrar banner nesse
 * caso não protege ninguém: só ensina o visitante a clicar em "aceitar" sem
 * ler, e é justamente isso que a ANPD critica.
 *
 * Enquanto não houver decisão, os scripts NÃO carregam. Consentimento válido
 * é anterior ao tratamento — banner que já rastreou antes do clique é
 * decorativo.
 */

type Props = {
  storeSlug: string;
  gaId?: string | null;
  pixelId?: string | null;
};

type Escolha = 'aceito' | 'recusado';

function chave(slug: string) {
  return `lv_cookies_${slug}`;
}

function lerEscolha(slug: string): Escolha | null {
  try {
    const v = localStorage.getItem(chave(slug));
    return v === 'aceito' || v === 'recusado' ? v : null;
  } catch {
    // navegação privada ou armazenamento bloqueado: trata como sem decisão
    return null;
  }
}

function carregarMedicao(gaId?: string | null, pixelId?: string | null) {
  if (gaId && !document.getElementById('lv-ga')) {
    const s = document.createElement('script');
    s.id = 'lv-ga';
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.appendChild(s);

    const init = document.createElement('script');
    init.id = 'lv-ga-init';
    init.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId.replace(/'/g, '')}');`;
    document.head.appendChild(init);
  }

  if (pixelId && !document.getElementById('lv-pixel')) {
    const s = document.createElement('script');
    s.id = 'lv-pixel';
    s.textContent = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId.replace(/'/g, '')}');fbq('track','PageView');`;
    document.head.appendChild(s);
  }
}

export function CookieConsent({ storeSlug, gaId, pixelId }: Props) {
  const [visivel, setVisivel] = useState(false);
  const temMedicao = Boolean(gaId || pixelId);

  useEffect(() => {
    if (!temMedicao) return;
    const escolha = lerEscolha(storeSlug);
    if (escolha === 'aceito') {
      carregarMedicao(gaId, pixelId);
      return;
    }
    if (escolha === null) setVisivel(true);
  }, [storeSlug, gaId, pixelId, temMedicao]);

  function decidir(escolha: Escolha) {
    try {
      localStorage.setItem(chave(storeSlug), escolha);
    } catch {
      // sem armazenamento a escolha vale só para esta visita
    }
    setVisivel(false);
    if (escolha === 'aceito') carregarMedicao(gaId, pixelId);
  }

  if (!visivel) return null;

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white p-4 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.4)] md:inset-x-auto md:right-4 md:bottom-4 md:max-w-sm md:rounded-lg md:border"
    >
      <p className="text-[13px] leading-relaxed text-ink">
        Usamos cookies de medição para entender como a loja é usada. Os cookies
        necessários para o funcionamento do site e do seu carrinho continuam
        ativos de qualquer forma.
      </p>
      <p className="mt-2 text-[12px] text-muted">
        Detalhes na{' '}
        <Link
          href={`/loja/${storeSlug}/politicas/privacidade`}
          className="font-semibold underline"
        >
          política de privacidade
        </Link>
        .
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn btn-accent flex-1 py-2 text-[13px]"
          onClick={() => decidir('aceito')}
        >
          Aceitar
        </button>
        <button
          type="button"
          className="btn btn-ghost flex-1 py-2 text-[13px]"
          onClick={() => decidir('recusado')}
        >
          Só os necessários
        </button>
      </div>
    </div>
  );
}
