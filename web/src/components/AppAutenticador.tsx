/**
 * Indica o app autenticador e onde baixar. Ícone genérico (escudo com
 * relógio): o código funciona em qualquer app do padrão, o Google
 * Authenticator é só a sugestão.
 */
export function IconeAutenticador({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      className="shrink-0"
    >
      <rect width="40" height="40" rx="10" fill="#e8f4f6" />
      <path
        d="M20 8.5 29 12v7.2c0 5.6-3.8 10.4-9 12.3-5.2-1.9-9-6.7-9-12.3V12l9-3.5Z"
        fill="#2b7f8e"
      />
      <circle cx="20" cy="19.5" r="6" fill="#fff" />
      <path
        d="M20 16.2v3.5l2.3 1.4"
        stroke="#2b7f8e"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

const ANDROID =
  'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2';
const IPHONE = 'https://apps.apple.com/app/google-authenticator/id388497605';

export function AppAutenticador({ compacto = false }: { compacto?: boolean }) {
  return (
    <div className="flex items-start gap-3 border border-line bg-[#f7fafb] px-3.5 py-3">
      <IconeAutenticador size={compacto ? 32 : 40} />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-ink">
          {compacto ? 'Google Authenticator' : 'Use o Google Authenticator'}
        </p>
        <p className="text-[13px] text-muted">
          {compacto
            ? 'Abra o app e digite o código da Vendira.'
            : 'Grátis. Também funciona com Microsoft Authenticator ou outro app de códigos.'}
        </p>
        {!compacto ? (
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
            <a
              href={ANDROID}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#2b7f8e] underline-offset-2 hover:underline"
            >
              Baixar para Android
            </a>
            <a
              href={IPHONE}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#2b7f8e] underline-offset-2 hover:underline"
            >
              Baixar para iPhone
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
