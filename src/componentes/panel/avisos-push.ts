"use client";

import { llamarApi } from "./api";

/**
 * Avisos push del panel en el navegador (RF-023). El service worker vive en /sw.js con scope /admin/:
 * solo controla el panel, nunca el menú público. En iPhone el push solo existe con el panel
 * instalado en la pantalla de inicio (riesgo R11 del plan).
 */

export type EstadoAvisos = "cargando" | "no-soportado" | "instalar-en-iphone" | "bloqueado" | "inactivo" | "activo";

const RUTA = "/api/v1/admin/push/subscribe";

function esIphone() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function instalada() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function soporta() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function claveABytes(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const binario = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

// Sin barra final: con "/admin/" la pantalla de pedidos (/admin) quedaba fuera del scope.
const SCOPE = "/admin";

async function registro() {
  // La primera versión se registraba con "/admin/": se da de baja para no tener dos.
  for (const r of await navigator.serviceWorker.getRegistrations()) {
    if (new URL(r.scope).pathname === "/admin/") await r.unregister();
  }
  return navigator.serviceWorker.register("/sw.js", { scope: SCOPE, updateViaCache: "none" });
}

/**
 * Espera a que el service worker de este registro esté activo. No usa `serviceWorker.ready`, que
 * espera al registro de la página actual y puede no resolverse nunca.
 */
async function activo(reg: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  if (reg.active) return reg;
  const worker = reg.installing ?? reg.waiting;
  if (!worker) throw new Error("service worker sin instalar");
  await new Promise<void>((resolver, rechazar) => {
    const t = window.setTimeout(() => rechazar(new Error("service worker sin activar")), 10_000);
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") {
        window.clearTimeout(t);
        resolver();
      } else if (worker.state === "redundant") {
        window.clearTimeout(t);
        rechazar(new Error("service worker descartado"));
      }
    });
  });
  return reg;
}

/**
 * Estado actual. Si el navegador ya estaba suscripto, lo vuelve a registrar a nombre del usuario de
 * la sesión (en un dispositivo compartido puede haber ingresado otra persona).
 */
export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (!soporta()) return esIphone() && !instalada() ? "instalar-en-iphone" : "no-soportado";
  // Se registra siempre, también sin permiso: la app instalada queda con su service worker.
  const reg = await registro();
  if (Notification.permission === "denied") return "bloqueado";
  const suscripcion = await reg.pushManager.getSubscription();
  if (!suscripcion || Notification.permission !== "granted") return "inactivo";
  await llamarApi("POST", RUTA, suscripcion.toJSON()).catch(() => {});
  return "activo";
}

/** Pide permiso (tiene que ser después de un toque) y registra el navegador. */
export async function activarAvisos(clavePublica: string): Promise<EstadoAvisos> {
  const permiso = await Notification.requestPermission();
  if (permiso === "denied") return "bloqueado";
  if (permiso !== "granted") return "inactivo";
  const reg = await activo(await registro());
  const suscripcion =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(clavePublica) }));
  await llamarApi("POST", RUTA, suscripcion.toJSON());
  return "activo";
}

/** Da de baja este navegador en el servidor y en el navegador. Nunca lanza. */
export async function desactivarAvisos(): Promise<void> {
  try {
    if (!soporta()) return;
    const reg = await navigator.serviceWorker.getRegistration(SCOPE);
    const suscripcion = await reg?.pushManager.getSubscription();
    if (!suscripcion) return;
    await llamarApi("DELETE", RUTA, { endpoint: suscripcion.endpoint }).catch(() => {});
    await suscripcion.unsubscribe();
  } catch {
    // Sin service worker o sin permiso: no hay nada que dar de baja.
  }
}
