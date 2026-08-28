'use client';

import { getUser } from '@/lib/auth';
import { CONTACT, supportWhatsappHref } from '@/lib/contact';

export default function AdminSuportePage() {
  const user = getUser();
  const wa = supportWhatsappHref(user?.store?.name, user?.store?.slug);

  return (
    <div className="admin-page max-w-xl">
      <div>
        <h1>Suporte</h1>
        <p className="text-sm text-muted">
          Fale com a gente pelo WhatsApp para tirar dúvidas do painel, frete,
          pagamento ou qualquer problema da loja.
        </p>
      </div>

      <div className="card space-y-3 !p-4">
        <p className="text-sm font-bold">Atendimento pelo WhatsApp</p>
        <p className="text-sm text-muted">
          Ao clicar, o WhatsApp abre com uma mensagem pronta incluindo o nome da
          sua loja — assim o suporte já sabe quem você é.
        </p>
        {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="btn inline-flex w-full items-center justify-center gap-2 bg-[#25D366] text-white hover:opacity-95"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12.04 2C6.58 2 2.15 6.4 2.15 11.84c0 1.99.58 3.84 1.6 5.4L2 22l4.92-1.7a9.86 9.86 0 0 0 5.12 1.4h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2zm5.75 14.16c-.24.68-1.4 1.25-1.93 1.33-.5.08-1.13.11-1.82-.11-.42-.14-.96-.31-1.66-.61-2.92-1.26-4.82-4.2-4.97-4.39-.14-.19-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.45.27-.29.59-.36.79-.36h.57c.18 0 .42-.07.66.5.24.58.82 2 .89 2.14.07.14.12.31.02.5-.1.19-.14.31-.28.48-.14.17-.3.38-.42.51-.14.14-.28.29-.12.57.16.28.7 1.15 1.5 1.86 1.03.92 1.9 1.2 2.17 1.34.27.14.43.12.59-.07.16-.19.68-.79.86-1.06.18-.27.36-.22.61-.13.24.09 1.55.73 1.82.86.27.14.45.2.52.31.07.11.07.64-.17 1.32z" />
          </svg>
          Abrir WhatsApp do suporte
        </a>
        ) : (
          <p className="text-sm text-muted">
            Canal de WhatsApp ainda não configurado pela plataforma.
          </p>
        )}
        {CONTACT.email ? (
          <p className="text-[11px] text-muted">
            Também pode escrever para {CONTACT.email} se preferir e-mail.
          </p>
        ) : null}
      </div>

      <div className="card space-y-2 !p-4">
        <p className="text-sm font-bold">O que o suporte ajuda</p>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted">
          <li>Configurar frete (Melhor Envio, Frenet, SuperFrete)</li>
          <li>Mercado Pago e pagamentos</li>
          <li>Produtos, pedidos e reembolsos</li>
          <li>Domínio, logo e aparência da loja</li>
        </ul>
      </div>
    </div>
  );
}
