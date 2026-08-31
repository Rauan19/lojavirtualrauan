'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { whatsappHref } from '@/lib/contact';

const links = [
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#o-que-inclui', label: 'O que inclui' },
  { href: '#contato', label: 'Contato' },
];

type SiteHeaderProps = {
  solid?: boolean;
};

export function SiteHeader({ solid = false }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const wa = whatsappHref();
  const light = solid || scrolled || open;

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (solid) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [solid]);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-40 border-b transition-colors duration-200 ${
          light
            ? 'border-[#d9dde3] bg-[#f7f8fa]/95 text-[#171a1f] backdrop-blur'
            : 'border-transparent bg-transparent text-white'
        }`}
      >
        <div className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-4 md:h-16 md:px-6">
          <Link href="/" className="flex items-center" aria-label="Página inicial">
            <BrandLogo height={34} priority className="md:hidden" />
            <BrandLogo height={40} priority className="hidden md:block" />
          </Link>

          <nav className="hidden items-center gap-6 text-[13px] font-medium md:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-accent">
                {l.label}
              </Link>
            ))}
            <Link href="/criar-conta" className="btn btn-accent py-2">
              Criar minha loja
            </Link>
          </nav>

          <button
            type="button"
            className={`icon-btn md:hidden ${light ? 'text-[#171a1f]' : 'text-white'}`}
            aria-label="Abrir menu"
            onClick={() => setOpen(true)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <div className={`drawer-backdrop ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`drawer ${open ? 'open' : ''}`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <BrandLogo height={32} />
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => setOpen(false)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <nav className="py-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block border-b border-line px-4 py-3.5 text-base font-medium"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/criar-conta"
            className="block px-4 py-3.5 text-base font-bold text-accent"
            onClick={() => setOpen(false)}
          >
            Criar minha loja grátis
          </Link>
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="block border-t border-line px-4 py-3.5 text-base font-medium"
              onClick={() => setOpen(false)}
            >
              Prefiro falar no WhatsApp antes
            </a>
          ) : null}
        </nav>
      </aside>
    </>
  );
}
