/*
 * Service worker del panel (scope /admin). Solo muestra los avisos push y abre el panel al tocarlos.
 * No guarda nada en caché a propósito: el panel siempre tiene que mostrar los pedidos del momento.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let datos = { title: "Pedido nuevo", body: "Abrí el panel para verlo.", tag: "pedido", url: "/admin" };
  try {
    if (event.data) datos = { ...datos, ...event.data.json() };
  } catch {
    // Mensaje que no es JSON: se muestra el aviso genérico.
  }
  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      tag: datos.tag,
      renotify: true,
      requireInteraction: true,
      icon: "/panel/icono-192.png",
      badge: "/panel/badge-96.png",
      vibrate: [200, 100, 200],
      data: { url: datos.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url ?? "/admin", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const panel = ventanas.find((v) => new URL(v.url).pathname.startsWith("/admin"));
      if (panel) {
        await panel.focus();
        if (panel.url !== destino) await panel.navigate(destino).catch(() => {});
        return;
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
