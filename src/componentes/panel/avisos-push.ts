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

async function registro() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/admin/", updateViaCache: "none" });
}

/**
 * Estado actual. Si el navegador ya estaba suscripto, lo vuelve a registrar a nombre del usuario de
 * la sesión (en un dispositivo compartido puede haber ingresado otra persona).
 */
export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (!soporta()) return esIphone() && !instalada() ? "instalar-en-iphone" : "no-soportado";
  if (Notification.permission === "denied") return "bloqueado";
  const suscripcion = await (await registro()).pushManager.getSubscription();
  if (!suscripcion || Notification.permission !== "granted") return "inactivo";
  await llamarApi("POST", RUTA, suscripcion.toJSON()).catch(() => {});
  return "activo";
}

/** Pide permiso (tiene que ser después de un toque) y registra el navegador. */
export async function activarAvisos(clavePublica: string): Promise<EstadoAvisos> {
  const permiso = await Notification.requestPermission();
  if (permiso === "denied") return "bloqueado";
  if (permiso !== "granted") return "inactivo";
  const reg = await registro();
  await navigator.serviceWorker.ready;
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
    const reg = await navigator.serviceWorker.getRegistration("/admin/");
    const suscripcion = await reg?.pushManager.getSubscription();
    if (!suscripcion) return;
    await llamarApi("DELETE", RUTA, { endpoint: suscripcion.endpoint }).catch(() => {});
    await suscripcion.unsubscribe();
  } catch {
    // Sin service worker o sin permiso: no hay nada que dar de baja.
  }
}
