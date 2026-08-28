import { NextRequest, NextResponse } from 'next/server';

/**
 * Domínios da plataforma (não reescreve para /loja/[slug]).
 * Ex: PLATFORM_HOSTS=localhost,127.0.0.1,app.seudominio.com
 */
function platformHosts(): Set<string> {
  const raw =
    process.env.PLATFORM_HOSTS ||
    'localhost,127.0.0.1';
  return new Set(
    raw
      .split(',')
      .map((h) => h.trim().toLowerCase().replace(/^www\./, ''))
      .filter(Boolean),
  );
}

function cleanHost(raw: string | null): string {
  if (!raw) return '';
  return raw.split(':')[0].trim().toLowerCase().replace(/^www\./, '');
}

function isPassthroughPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api') ||
    pathname.startsWith('/uploads') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/super') ||
    pathname.startsWith('/redefinir-senha') ||
    pathname.startsWith('/loja/')
  );
}

export async function middleware(req: NextRequest) {
  const host = cleanHost(req.headers.get('x-forwarded-host') || req.headers.get('host'));
  if (!host || platformHosts().has(host)) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  if (isPassthroughPath(pathname)) {
    return NextResponse.next();
  }

  const apiOrigin =
    process.env.API_PROXY_TARGET ||
    process.env.NEXT_PUBLIC_API_ORIGIN ||
    'http://127.0.0.1:3001';

  try {
    const res = await fetch(
      `${apiOrigin.replace(/\/$/, '')}/api/public/resolve-host?host=${encodeURIComponent(host)}`,
      { headers: { Accept: 'application/json' }, next: { revalidate: 60 } },
    );
    if (!res.ok) {
      return NextResponse.next();
    }
    const data = (await res.json()) as { slug?: string };
    if (!data.slug) {
      return NextResponse.next();
    }

    const url = req.nextUrl.clone();
    const suffix = pathname === '/' ? '' : pathname;
    url.pathname = `/loja/${data.slug}${suffix}`;
    return NextResponse.rewrite(url);
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Tudo exceto arquivos estáticos óbvios.
     */
    '/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|txt|xml)$).*)',
  ],
};
