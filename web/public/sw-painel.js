/*
 * Service worker do painel da loja: só recebe os avisos "Você vendeu!".
 * Não guarda páginas em cache (o painel precisa estar sempre atualizado).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let aviso = {};
  try {
    aviso = event.data ? event.data.json() : {};
  } catch {
    aviso = { title: 'Minha loja', body: event.data ? event.data.text() : '' };
  }
  const title = aviso.title || 'Minha loja';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: aviso.body || '',
      icon: '/painel-192.png',
      tag: aviso.tag,
      renotify: Boolean(aviso.tag),
      data: { url: aviso.url || '/admin/orders' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL(
    (event.notification.data && event.notification.data.url) || '/admin/orders',
    self.location.origin,
  );
  // Só abre páginas do próprio painel
  if (destino.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((janelas) => {
        for (const j of janelas) {
          if (new URL(j.url).pathname.startsWith('/admin') && 'navigate' in j) {
            return j.navigate(destino.href).then((w) => (w || j).focus());
          }
        }
        return self.clients.openWindow(destino.href);
      }),
  );
});
