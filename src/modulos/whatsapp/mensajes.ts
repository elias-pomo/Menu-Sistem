import { formatearPesos } from "@/lib/dinero";

/**
 * Avisos al cliente por WhatsApp con enlaces `wa.me` (RF-027, sección 22 del plan): el panel arma el
 * mensaje según el estado y abre el chat del cliente; el personal toca enviar. Archivo puro: lo usa
 * el panel en el navegador. El sistema nunca sabe si el mensaje se envió.
 */

export type PedidoParaMensaje = {
  code: string;
  status: string;
  fulfillment: "PICKUP" | "DELIVERY";
  customerName: string | null;
  estimatedMinutes: number | null;
  totalCents: number;
  paymentMethod: "CASH" | "TRANSFER";
  cancelReason: string | null;
};

export type NegocioParaMensaje = {
  name: string;
  address: string | null;
  transferAlias: string | null;
  transferHolder: string | null;
};

/** Por qué se canceló, como sigue la frase "tuvimos que cancelar tu pedido K7P2…". */
const MOTIVO_PARA_CLIENTE: Record<string, string> = {
  OUT_OF_STOCK: " porque nos quedamos sin stock",
  OUT_OF_ZONE: " porque tu dirección está fuera de nuestra zona de entrega",
  CLOSED: " porque ya cerramos",
  INVALID_DATA: " porque no pudimos confirmar tus datos",
  DUPLICATE: " porque estaba repetido",
};

/** Estados con mensaje. PENDING no tiene: el local todavía no respondió. */
export const ESTADOS_CON_MENSAJE = ["CONFIRMED", "PREPARING", "READY", "ON_THE_WAY", "DELIVERED", "CANCELLED"] as const;

function primerNombre(nombre: string | null): string {
  const primero = nombre?.trim().split(/\s+/)[0];
  return primero ? ` ${primero}` : "";
}

/** Texto del mensaje para el estado actual del pedido, o null si ese estado no lleva aviso. */
export function mensajeParaCliente(p: PedidoParaMensaje, negocio: NegocioParaMensaje, urlSeguimiento: string): string | null {
  const hola = `¡Hola${primerNombre(p.customerName)}!`;
  const seguimiento = `Seguilo acá: ${urlSeguimiento}`;
  const total = formatearPesos(p.totalCents);

  switch (p.status) {
    case "CONFIRMED": {
      const lineas = [`${hola} Confirmamos tu pedido ${p.code} en ${negocio.name}.${p.estimatedMinutes ? ` Va a estar listo en unos ${p.estimatedMinutes} minutos.` : ""}`];
      if (p.paymentMethod === "TRANSFER" && negocio.transferAlias) {
        lineas.push(`Podés transferir ${total} al alias ${negocio.transferAlias}${negocio.transferHolder ? ` (${negocio.transferHolder})` : ""}.`);
      }
      lineas.push(seguimiento);
      return lineas.join("\n");
    }
    case "PREPARING":
      return `${hola} Ya estamos preparando tu pedido ${p.code}.\n${seguimiento}`;
    case "READY":
      return p.fulfillment === "PICKUP"
        ? `${hola} Tu pedido ${p.code} está listo para retirar${negocio.address ? ` en ${negocio.address}` : ""}.${p.paymentMethod === "CASH" ? ` Son ${total}.` : ""}`
        : `${hola} Tu pedido ${p.code} está listo y sale en un rato.\n${seguimiento}`;
    case "ON_THE_WAY":
      return `${hola} Tu pedido ${p.code} va en camino.${p.paymentMethod === "CASH" ? ` Son ${total} en efectivo.` : ""}\n${seguimiento}`;
    case "DELIVERED":
      return `¡Gracias por tu pedido${primerNombre(p.customerName).replace(/^ /, ", ")}! Esperamos que lo disfrutes. ${negocio.name}`;
    case "CANCELLED":
      if (p.cancelReason === "CUSTOMER_REQUEST") return `Hola${primerNombre(p.customerName)}, cancelamos tu pedido ${p.code} como nos pediste.`;
      return `Hola${primerNombre(p.customerName)}, tuvimos que cancelar tu pedido ${p.code}${MOTIVO_PARA_CLIENTE[p.cancelReason ?? ""] ?? ""}. Disculpá las molestias.`;
    default:
      return null;
  }
}

/**
 * `https://wa.me/5493815551234?text=…` (sección 22). El teléfono ya viene en E.164 desde el pedido;
 * no se usa `lib/telefono` para no cargar libphonenumber en el navegador del panel.
 */
export function enlaceWhatsApp(telefonoE164: string, texto: string): string {
  return `https://wa.me/${telefonoE164.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
}
