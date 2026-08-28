'use client';

import { useEffect } from 'react';

/** Evita o browser restaurar scroll no meio/fim da página no reload (comum no mobile). */
export function ScrollToTop() {
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    const toTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    toTop();
    const id = window.setTimeout(toTop, 50);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) toTop();
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  return null;
}
