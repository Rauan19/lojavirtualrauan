'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { whatsappHref } from '@/lib/contact';

const links = [
  { href: '/#como-funciona', label: 'Como funciona' },
  { href: '/#o-que-inclui', label: 'Recursos' },
  { href: '/#planos', label: 'Preços' },
  { href: '/#faq', label: 'Dúvidas' },
];

/*
 * Header do site no padrão das plataformas grandes (Nuvemshop, Shopify):
 * branco, logo à esquerda, seções no meio e, à direita, "Entrar" discreto e
 * o botão de criar loja em pílula. A sombra só aparece depois de rolar.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const wa = whatsappHref();

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-40 bg-white text-[#171a1f] transition-shadow duration-200 ${
          scrolled
            ? 'shadow-[0_6px_20px_-12px_rgba(13,58,67,0.35)]'
            : 'shadow-[inset_0_-1px_0_#e6e9ed]'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-6 px-4 md:h-[72px] md:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center"
            aria-label="Página inicial"
          >
            <BrandLogo height={32} priority className="md:hidden" />
            <BrandLogo height={38} priority className="hidden md:block" />
          </Link>

          <nav
            className="hidden flex-1 items-center justify-center gap-1 lg:flex"
            aria-label="Seções"
          >
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="site-nav-link">
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Link
              href="/login"
              className="site-btn site-btn--ghost hidden sm:inline-flex"
            >
              Entrar
            </Link>
            <Link
              href="/criar-conta"
              className="site-btn site-btn--primary inline-flex !h-10 !px-4 !text-[14px] sm:!h-11 sm:!px-5 sm:!text-[14.5px]"
            >
              Criar loja grátis
            </Link>
            <button
              type="button"
              className="icon-btn lg:hidden"
              aria-label="Abrir menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div
        className={`drawer-backdrop ${open ? 'open' : ''}`}
        onClick={() => setOpen(false)}
      />
      <aside
        className={`drawer flex flex-col ${open ? 'open' : ''}`}
        aria-label="Menu"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <BrandLogo height={30} />
          <button
            type="button"
            className="icon-btn"
            aria-label="Fechar"
            onClick={() => setOpen(false)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex items-center justify-between rounded-xl px-3 py-3.5 text-[16px] font-semibold hover:bg-[#f4f6f8]"
              onClick={() => setOpen(false)}
            >
              {l.label}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                className="text-muted"
              >
                <path
                  d="m9 6 6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          ))}
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-xl px-3 py-3.5 text-[16px] font-semibold hover:bg-[#f4f6f8]"
              onClick={() => setOpen(false)}
            >
              Falar no WhatsApp
            </a>
          ) : null}
        </nav>
        <div className="grid gap-2 border-t border-line p-4">
          <Link
            href="/criar-conta"
            className="site-btn site-btn--primary flex h-12 w-full"
            onClick={() => setOpen(false)}
          >
            Criar loja grátis
          </Link>
          <Link
            href="/login"
            className="site-btn site-btn--ghost flex h-12 w-full"
            onClick={() => setOpen(false)}
          >
            Entrar
          </Link>
        </div>
      </aside>
    </>
  );
}
