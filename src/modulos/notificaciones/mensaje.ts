import { formatearPesos, type Centavos } from "@/lib/dinero";

/**
 * Texto del aviso push de pedido nuevo. Puro, sin dependencias del servidor: lo prueban los tests de
 * unidad. Lleva solo lo que el local necesita para decidir si abre el panel; nada de teléfono ni
 * dirección, porque la notificación se ve con el celular bloqueado.
 */

export type AvisoPedido = {
  code: string;
  fulfillment: "PICKUP" | "DELIVERY";
  customerName: string;
  totalCents: Centavos;
};

export type MensajePush = {
  title: string;
  body: string;
  /** Mismo tag = reemplaza la notificación anterior del mismo pedido en vez de apilarla. */
  tag: string;
  url: string;
};

const MAX_NOMBRE = 30;

export function mensajePedidoNuevo(pedido: AvisoPedido): MensajePush {
  const nombre = pedido.customerName.trim();
  const corto = nombre.length > MAX_NOMBRE ? `${nombre.slice(0, MAX_NOMBRE - 1)}…` : nombre;
  const entrega = pedido.fulfillment === "DELIVERY" ? "Delivery" : "Retiro";
  return {
    title: `Pedido nuevo ${pedido.code}`,
    body: `${entrega} · ${formatearPesos(pedido.totalCents)} · ${corto}`,
    tag: `pedido-${pedido.code}`,
    url: "/admin",
  };
}

/** Aviso que el usuario se manda a sí mismo desde el panel para comprobar que le llegan. */
export function mensajePrueba(): MensajePush {
  return { title: "Avisos activados", body: "Así te va a llegar cada pedido nuevo.", tag: "prueba", url: "/admin" };
}
