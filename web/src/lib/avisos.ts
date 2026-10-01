'use client';

/** Avisos "Você vendeu!" (Web Push) do painel: o lado do navegador. */

export const SW_URL = '/sw-painel.js';
export const SW_ESCOPO = '/admin';

export function pushSuportado() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function ehIphone() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Aberto pelo ícone da tela inicial (no iPhone, push só funciona assim). */
export function instalado() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** "Chrome no Android", para a lista de aparelhos. */
export function nomeDoAparelho() {
  const ua = navigator.userAgent;
  const sistema = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPod/.test(ua)
      ? 'iPhone'
      : /iPad/.test(ua)
        ? 'iPad'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'computador';
  const navegador = /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung Internet'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Navegador';
  return `${navegador} no ${sistema}`;
}

/** A chave do servidor vem em base64url; o navegador quer bytes. */
export function chaveEmBytes(base64url: string) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(b64);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

export async function registroDoPainel() {
  return navigator.serviceWorker.register(SW_URL, { scope: SW_ESCOPO });
}

/** Inscrição deste aparelho, se houver (sem pedir permissão). */
export async function inscricaoAtual(): Promise<PushSubscription | null> {
  if (!pushSuportado()) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_ESCOPO);
  return (await reg?.pushManager.getSubscription()) ?? null;
}
