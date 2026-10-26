import "server-only";
import webpush, { WebPushError } from "web-push";
import { db } from "@/lib/bd";
import type { UsuarioSesion } from "@/modulos/autenticacion";
import type { NegocioId } from "@/modulos/negocio/alcance";
import type { SuscripcionDatos } from "./esquemas";
import { mensajePedidoNuevo, type AvisoPedido, type MensajePush } from "./mensaje";

/**
 * Push del panel (RF-023, ADR-005). Es un aviso extra: si falla, se registra y se sigue, porque el
 * polling del panel igual muestra el pedido. Una suscripción por navegador (`endpoint` único).
 */

/** Clave pública para el navegador, o null si el push no está configurado. */
export function clavePublicaPush(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function configurado(): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
}

/**
 * Registra el navegador para el usuario de la sesión. Si el mismo navegador estaba registrado por
 * otro usuario (otro ingreso en el mismo dispositivo), pasa a ser del actual.
 */
export async function suscribir(sesion: UsuarioSesion, datos: SuscripcionDatos) {
  const valores = { businessId: sesion.businessId, userId: sesion.userId, p256dh: datos.keys.p256dh, auth: datos.keys.auth };
  await db.pushSubscription.upsert({
    where: { endpoint: datos.endpoint },
    create: { endpoint: datos.endpoint, ...valores },
    update: valores,
  });
}

/** Baja de un navegador. Solo borra si es del mismo usuario y negocio; si no existe, no hace nada. */
export async function desuscribir(sesion: UsuarioSesion, endpoint: string) {
  await db.pushSubscription.deleteMany({ where: { endpoint, businessId: sesion.businessId, userId: sesion.userId } });
}

/** Envía el mensaje a todos los navegadores de usuarios activos del negocio. Nunca lanza. */
export async function enviarAlNegocio(businessId: NegocioId, mensaje: MensajePush, enviar = enviarUno): Promise<{ enviados: number; borrados: number }> {
  const destinos = await db.pushSubscription.findMany({
    where: { businessId, user: { isActive: true } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  const cuerpo = JSON.stringify(mensaje);
  const vencidas: string[] = [];
  let enviados = 0;
  await Promise.all(
    destinos.map(async (d) => {
      try {
        await enviar({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, cuerpo);
        enviados++;
      } catch (error) {
        // 404/410: el navegador dio de baja la suscripción (desinstaló, borró datos). Se descarta.
        const status = error instanceof WebPushError ? error.statusCode : (error as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) vencidas.push(d.id);
        else console.error(JSON.stringify({ evento: "push_error", businessId, status: status ?? null, error: String(error) }));
      }
    }),
  );
  if (vencidas.length) await db.pushSubscription.deleteMany({ where: { id: { in: vencidas }, businessId } });
  return { enviados, borrados: vencidas.length };
}

async function enviarUno(destino: SuscripcionDatos, cuerpo: string) {
  await webpush.sendNotification(destino, cuerpo, {
    vapidDetails: { subject: process.env.VAPID_SUBJECT!, publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! },
    // Un aviso de pedido de hace más de 15 minutos ya no sirve: el panel tiene la alerta de demorados.
    TTL: 900,
    urgency: "high",
    timeout: 5_000,
  });
}

/** Aviso de pedido nuevo. Pensado para correr en `after()`, después de responder al cliente. */
export async function avisarPedidoNuevo(businessId: NegocioId, pedido: AvisoPedido) {
  if (!configurado()) return;
  try {
    await enviarAlNegocio(businessId, mensajePedidoNuevo(pedido));
  } catch (error) {
    console.error(JSON.stringify({ evento: "push_error", businessId, error: String(error) }));
  }
}
