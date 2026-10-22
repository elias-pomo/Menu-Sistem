import { tieneRolMinimo, type Rol } from "@/modulos/autenticacion/permisos";
import type { TipoEntrega } from "./calculo";

/**
 * Máquina de estados de los pedidos (sección 16 del plan). Las transiciones son datos: una sola
 * tabla, sin condiciones repartidas por el código.
 */

export const ESTADOS = ["PENDING", "CONFIRMED", "PREPARING", "READY", "ON_THE_WAY", "DELIVERED", "CANCELLED"] as const;
export type EstadoPedido = (typeof ESTADOS)[number];

export const ESTADOS_TERMINALES: readonly EstadoPedido[] = ["DELIVERED", "CANCELLED"];
export const ESTADOS_ACTIVOS: readonly EstadoPedido[] = ESTADOS.filter((e) => !ESTADOS_TERMINALES.includes(e));

type Avance = { to: EstadoPedido; solo?: TipoEntrega };

/** Avances permitidos (sin contar la cancelación, que se permite desde cualquier estado activo). */
const AVANCES: Record<EstadoPedido, readonly Avance[]> = {
  PENDING: [{ to: "CONFIRMED" }],
  CONFIRMED: [{ to: "PREPARING" }],
  PREPARING: [{ to: "READY" }],
  READY: [
    { to: "ON_THE_WAY", solo: "DELIVERY" },
    { to: "DELIVERED", solo: "PICKUP" },
  ],
  ON_THE_WAY: [{ to: "DELIVERED" }],
  DELIVERED: [],
  CANCELLED: [],
};

/** Retroceso de un estado para corregir errores: solo encargado o dueño, con motivo. */
const RETROCESOS: Partial<Record<EstadoPedido, EstadoPedido>> = {
  CONFIRMED: "PENDING",
  PREPARING: "CONFIRMED",
  READY: "PREPARING",
  ON_THE_WAY: "READY",
};

export type TipoTransicion = "AVANCE" | "RETROCESO" | "CANCELACION";

export type ResultadoTransicion =
  | { ok: true; tipo: TipoTransicion }
  | { ok: false; code: "INVALID_TRANSITION" | "FORBIDDEN" | "REASON_REQUIRED" };

export function evaluarTransicion(params: {
  from: EstadoPedido;
  to: EstadoPedido;
  fulfillment: TipoEntrega;
  role: Rol;
  /** Motivo escrito (retroceso) o motivo de la lista (cancelación). */
  reason?: string | null;
}): ResultadoTransicion {
  const { from, to, fulfillment, role } = params;
  const reason = params.reason?.trim();
  if (ESTADOS_TERMINALES.includes(from)) return { ok: false, code: "INVALID_TRANSITION" };
  // Estado que no corresponde al tipo de entrega (un retiro nunca está "en camino").
  if (from === "ON_THE_WAY" && fulfillment === "PICKUP") return { ok: false, code: "INVALID_TRANSITION" };

  if (to === "CANCELLED") {
    if (!tieneRolMinimo(role, "STAFF")) return { ok: false, code: "FORBIDDEN" };
    return reason ? { ok: true, tipo: "CANCELACION" } : { ok: false, code: "REASON_REQUIRED" };
  }

  if (AVANCES[from].some((a) => a.to === to && (!a.solo || a.solo === fulfillment))) {
    return tieneRolMinimo(role, "STAFF") ? { ok: true, tipo: "AVANCE" } : { ok: false, code: "FORBIDDEN" };
  }

  if (RETROCESOS[from] === to) {
    if (!tieneRolMinimo(role, "MANAGER")) return { ok: false, code: "FORBIDDEN" };
    return reason ? { ok: true, tipo: "RETROCESO" } : { ok: false, code: "REASON_REQUIRED" };
  }

  return { ok: false, code: "INVALID_TRANSITION" };
}

/** Siguiente paso habitual: el botón de un toque en la tarjeta del pedido (null si es terminal). */
export function siguienteEstado(from: EstadoPedido, fulfillment: TipoEntrega): EstadoPedido | null {
  return AVANCES[from].find((a) => !a.solo || a.solo === fulfillment)?.to ?? null;
}

export const ETIQUETA_ACCION: Partial<Record<EstadoPedido, string>> = {
  CONFIRMED: "Confirmar",
  PREPARING: "Empezar",
  READY: "Listo",
  ON_THE_WAY: "En camino",
  DELIVERED: "Entregado",
};

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  PREPARING: "En preparación",
  READY: "Listo",
  ON_THE_WAY: "En camino",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

/** Columna de fecha que se completa al llegar a cada estado. */
export const MARCA_DE_TIEMPO: Partial<Record<EstadoPedido, "confirmedAt" | "readyAt" | "deliveredAt" | "cancelledAt">> = {
  CONFIRMED: "confirmedAt",
  READY: "readyAt",
  DELIVERED: "deliveredAt",
  CANCELLED: "cancelledAt",
};

/** Texto que ve el cliente en el seguimiento. */
export function textoParaCliente(estado: EstadoPedido, fulfillment: TipoEntrega, estimatedMinutes?: number | null) {
  switch (estado) {
    case "PENDING":
      return "Pedido enviado. Falta que el local lo confirme.";
    case "CONFIRMED":
      return estimatedMinutes
        ? `El local confirmó tu pedido. Tiempo estimado: ${estimatedMinutes} min.`
        : "El local confirmó tu pedido.";
    case "PREPARING":
      return "Lo están preparando.";
    case "READY":
      return fulfillment === "PICKUP" ? "Ya podés pasar a retirarlo." : "Listo, esperando al repartidor.";
    case "ON_THE_WAY":
      return "Tu pedido está en camino.";
    case "DELIVERED":
      return "Entregado. ¡Gracias!";
    case "CANCELLED":
      return "El local canceló el pedido.";
  }
}
