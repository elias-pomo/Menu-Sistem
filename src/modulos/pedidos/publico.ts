import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/bd";
import { formatearPesos } from "@/lib/dinero";
import { AppError, noEncontrado } from "@/lib/errores";
import { registrarEventos, superaLimite } from "@/lib/limite-uso";
import { FORMATO_TOKEN_PUBLICO, generarCodigoCorto, generarTokenPublico } from "@/lib/tokens";
import { cargarProductosParaPedido } from "@/modulos/menu";
import { estadoApertura, fechaDeNegocio, obtenerNegocioPorSlug, type NegocioId } from "@/modulos/negocio";
import { calcularPedido } from "./calculo";
import type { PedidoNuevoDatos } from "./esquemas";
import { textoParaCliente } from "./estados";
import { insertarPedido } from "./repositorio";

/**
 * Creación y seguimiento públicos de pedidos (RF-008 a RF-017). El negocio sale del slug resuelto en
 * el servidor; del navegador solo se toman IDs, cantidades, notas y datos de contacto.
 */

export const LIMITES_PEDIDOS = {
  /** RN-17: un mismo celular, por negocio. */
  porCelularPorHora: 5,
  pendientesPorCelular: 2,
  /** Sección 15: creación de pedidos por IP. */
  porIpPorMinuto: 10,
};

const INTENTOS_CODIGO = 5;

export type PedidoCreado = {
  code: string;
  token: string;
  status: string;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  createdAt: string;
};

const resumen = (p: {
  publicCode: string;
  publicToken: string;
  status: string;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  createdAt: Date;
}): PedidoCreado => ({
  code: p.publicCode,
  token: p.publicToken,
  status: p.status,
  subtotalCents: p.subtotalCents,
  deliveryFeeCents: p.deliveryFeeCents,
  totalCents: p.totalCents,
  createdAt: p.createdAt.toISOString(),
});

async function pedidoPorSolicitud(businessId: NegocioId, clientRequestId: string) {
  return db.order.findUnique({ where: { businessId_clientRequestId: { businessId, clientRequestId } } });
}

export async function crearPedido(params: {
  slug: string;
  datos: PedidoNuevoDatos;
  ip: string | null;
  ahora?: Date;
}): Promise<{ pedido: PedidoCreado; repetido: boolean; businessId: NegocioId }> {
  const ahora = params.ahora ?? new Date();
  const { datos } = params;
  const negocio = await obtenerNegocioPorSlug(params.slug);
  if (!negocio) throw noEncontrado("No encontramos este negocio.");
  const businessId = negocio.id;

  // RF-014: el mismo envío (doble toque, reintento) devuelve el mismo pedido.
  const anterior = await pedidoPorSolicitud(businessId, datos.clientRequestId);
  if (anterior) return { pedido: resumen(anterior), repetido: true, businessId };

  if (!estadoApertura(negocio, negocio.openingHours, ahora).abierto) {
    throw new AppError("NOT_ACCEPTING_ORDERS", negocio.acceptingOrders ? "El local está cerrado en este horario." : (negocio.pauseMessage ?? "El local pausó los pedidos por un rato."));
  }

  // Límites de uso: por IP (bots) y por celular (RN-17).
  const claveIp = params.ip ? `pedido-ip:${params.ip}` : null;
  if (claveIp && (await superaLimite([{ key: claveIp, limit: LIMITES_PEDIDOS.porIpPorMinuto, windowMin: 1 }], ahora))) {
    throw new AppError("RATE_LIMITED", "Demasiados pedidos seguidos. Esperá un minuto y probá de nuevo.");
  }
  const telefono = datos.customer.phone;
  const [ultimaHora, pendientes] = await Promise.all([
    db.order.count({ where: { businessId, customerPhone: telefono, createdAt: { gt: new Date(ahora.getTime() - 3_600_000) } } }),
    db.order.count({ where: { businessId, customerPhone: telefono, status: "PENDING" } }),
  ]);
  if (ultimaHora >= LIMITES_PEDIDOS.porCelularPorHora) {
    throw new AppError("RATE_LIMITED", "Hiciste muchos pedidos en la última hora. Si necesitás algo más, escribile al local.");
  }
  if (pendientes >= LIMITES_PEDIDOS.pendientesPorCelular) {
    throw new AppError("RATE_LIMITED", "Ya tenés pedidos esperando que el local los confirme. Esperá a que respondan.");
  }

  // Cálculo con datos frescos de la base (nunca de la caché del menú).
  const productos = await cargarProductosParaPedido(
    db,
    businessId,
    datos.items.map((i) => i.productId),
  );
  const calculo = calcularPedido({ fulfillment: datos.fulfillment, paymentMethod: datos.payment.method, items: datos.items }, productos, negocio);
  if (!calculo.ok) {
    switch (calculo.code) {
      case "VALIDATION_ERROR":
        throw new AppError("VALIDATION_ERROR", "Revisá tu pedido.", { fields: calculo.fields });
      case "MENU_CHANGED":
        throw new AppError("MENU_CHANGED", "Algunos productos cambiaron. Revisá tu pedido.", { details: calculo.details });
      case "DELIVERY_DISABLED":
        throw new AppError("DELIVERY_DISABLED", "El local no está haciendo delivery. Podés elegir retiro.");
      case "PAYMENT_METHOD_DISABLED":
        throw new AppError("PAYMENT_METHOD_DISABLED", "Ese medio de pago no está disponible.");
      case "MIN_ORDER_NOT_REACHED":
        throw new AppError("MIN_ORDER_NOT_REACHED", `El pedido mínimo es ${formatearPesos(negocio.minOrderCents)}. Te faltan ${formatearPesos(calculo.missingCents)}.`, {
          details: [{ missingCents: calculo.missingCents }],
        });
    }
  }

  const efectivo = datos.payment.method === "CASH";
  const pagoCon = efectivo ? (datos.payment.changeFor ?? null) : null;
  if (pagoCon !== null && pagoCon < calculo.totalCents) {
    throw new AppError("VALIDATION_ERROR", "Revisá el pago.", { fields: { "payment.changeFor": `Tiene que ser al menos ${formatearPesos(calculo.totalCents)}.` } });
  }

  const businessDate = new Date(`${fechaDeNegocio(ahora, negocio.timezone)}T00:00:00Z`);
  const status = negocio.autoConfirm ? "CONFIRMED" : "PENDING";

  for (let intento = 1; ; intento++) {
    try {
      const pedido = await db.$transaction((tx) =>
        insertarPedido(tx, businessId, {
          businessDate,
          publicCode: generarCodigoCorto(),
          publicToken: generarTokenPublico(),
          clientRequestId: datos.clientRequestId,
          status,
          fulfillment: datos.fulfillment,
          customerName: datos.customer.name,
          customerPhone: telefono,
          address: datos.fulfillment === "DELIVERY" && datos.address ? datos.address : undefined,
          note: datos.note,
          paymentMethod: datos.payment.method,
          cashChangeForCents: pagoCon,
          lines: calculo.lines,
          subtotalCents: calculo.subtotalCents,
          deliveryFeeCents: calculo.deliveryFeeCents,
          totalCents: calculo.totalCents,
          createdAt: ahora,
        }),
      );
      if (claveIp) await registrarEventos([claveIp], ahora);
      return { pedido: resumen(pedido), repetido: false, businessId };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      // Dos envíos iguales en paralelo: el otro ya lo creó.
      const ganador = await pedidoPorSolicitud(businessId, datos.clientRequestId);
      if (ganador) return { pedido: resumen(ganador), repetido: true, businessId };
      // Código corto repetido en el día: se prueba con otro.
      if (intento >= INTENTOS_CODIGO) throw error;
    }
  }
}

/**
 * Seguimiento público con el token (RF-017). Sin teléfono ni dirección: solo el barrio si es
 * delivery. Un token inexistente, de otro negocio o mal escrito da el mismo 404.
 */
export async function obtenerSeguimiento(slug: string, token: string) {
  if (!FORMATO_TOKEN_PUBLICO.test(token)) return null;
  const pedido = await db.order.findUnique({
    where: { publicToken: token },
    include: {
      business: { select: { slug: true, name: true, whatsappE164: true, address: true, transferAlias: true, transferHolder: true } },
      items: { orderBy: { position: "asc" }, include: { options: true } },
    },
  });
  if (!pedido || pedido.business.slug !== slug) return null;
  return {
    code: pedido.publicCode,
    status: pedido.status,
    mensaje: textoParaCliente(pedido.status, pedido.fulfillment, pedido.estimatedMinutes),
    fulfillment: pedido.fulfillment,
    barrio: pedido.fulfillment === "DELIVERY" ? pedido.addressNeighborhood : null,
    estimatedMinutes: pedido.estimatedMinutes,
    paymentMethod: pedido.paymentMethod,
    items: pedido.items.map((i) => ({
      name: i.productName,
      quantity: i.quantity,
      detalle: i.options.map((o) => o.optionName).join(" · "),
      note: i.note,
      lineTotalCents: i.lineTotalCents,
    })),
    subtotalCents: pedido.subtotalCents,
    deliveryFeeCents: pedido.deliveryFeeCents,
    totalCents: pedido.totalCents,
    createdAt: pedido.createdAt.toISOString(),
    confirmedAt: pedido.confirmedAt?.toISOString() ?? null,
    negocio: {
      name: pedido.business.name,
      whatsappE164: pedido.business.whatsappE164,
      address: pedido.business.address,
      // El alias se muestra solo si el cliente eligió transferencia.
      transferencia: pedido.paymentMethod === "TRANSFER" ? { alias: pedido.business.transferAlias, titular: pedido.business.transferHolder } : null,
    },
  };
}

export type Seguimiento = NonNullable<Awaited<ReturnType<typeof obtenerSeguimiento>>>;
