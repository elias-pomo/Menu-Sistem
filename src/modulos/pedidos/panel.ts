import "server-only";
import { db } from "@/lib/bd";
import { AppError, noEncontrado } from "@/lib/errores";
import { esUuid } from "@/lib/ids";
import { registrarAuditoria } from "@/modulos/auditoria";
import { puede } from "@/modulos/autenticacion/permisos";
import type { UsuarioSesion } from "@/modulos/autenticacion";
import { fechaDeNegocio, obtenerNegocio } from "@/modulos/negocio";
import { ESTADOS_ACTIVOS } from "./estados";

/**
 * Pedidos en el panel (RF-022 a RF-029). El panel consulta cada pocos segundos con un cursor: la
 * primera vez trae los activos y los terminados del día; después, solo lo que cambió.
 */

const incluir = {
  items: { orderBy: { position: "asc" as const }, include: { options: true } },
  statusHistory: { orderBy: { createdAt: "asc" as const } },
};

type PedidoConDetalle = NonNullable<Awaited<ReturnType<typeof db.order.findFirst<{ include: typeof incluir }>>>>;

/** Forma del pedido para el panel (el panel sí ve teléfono y dirección). */
export function pedidoParaPanel(p: PedidoConDetalle) {
  return {
    id: p.id,
    code: p.publicCode,
    status: p.status,
    fulfillment: p.fulfillment,
    customerName: p.customerName,
    customerPhone: p.customerPhone,
    address: p.addressStreet
      ? { street: p.addressStreet, number: p.addressNumber, neighborhood: p.addressNeighborhood, unit: p.addressUnit, reference: p.addressReference }
      : null,
    note: p.note,
    paymentMethod: p.paymentMethod,
    cashChangeForCents: p.cashChangeForCents,
    subtotalCents: p.subtotalCents,
    deliveryFeeCents: p.deliveryFeeCents,
    totalCents: p.totalCents,
    estimatedMinutes: p.estimatedMinutes,
    paidAt: p.paidAt?.toISOString() ?? null,
    cancelReason: p.cancelReason,
    cancelNote: p.cancelNote,
    createdAt: p.createdAt.toISOString(),
    confirmedAt: p.confirmedAt?.toISOString() ?? null,
    updatedAt: p.updatedAt.toISOString(),
    items: p.items.map((i) => ({
      id: i.id,
      name: i.productName,
      quantity: i.quantity,
      note: i.note,
      lineTotalCents: i.lineTotalCents,
      options: i.options.map((o) => ({ name: o.optionName, kind: o.kind })),
    })),
    history: p.statusHistory.map((h) => ({ from: h.fromStatus, to: h.toStatus, reason: h.reason, at: h.createdAt.toISOString() })),
  };
}

export type PedidoPanel = ReturnType<typeof pedidoParaPanel>;

export async function listarPedidosPanel(sesion: UsuarioSesion, desde: Date | null, ahora = new Date()) {
  if (!puede(sesion.role, "pedidos.ver")) throw new AppError("FORBIDDEN", "No tenés permiso para hacer esto.");
  const { businessId } = sesion;
  const negocio = await obtenerNegocio(businessId);
  if (!negocio) throw noEncontrado();
  const hoy = new Date(`${fechaDeNegocio(ahora, negocio.timezone)}T00:00:00Z`);

  const pedidos = await db.order.findMany({
    where: desde
      ? { businessId, updatedAt: { gt: desde } }
      : { businessId, OR: [{ status: { in: [...ESTADOS_ACTIVOS] } }, { businessDate: hoy }] },
    orderBy: { createdAt: "asc" },
    include: incluir,
    take: 200,
  });

  // Resumen del día (RF-029): pedidos creados hoy, según su estado actual (sección 7 del plan).
  const delDia = await db.order.groupBy({
    by: ["status"],
    where: { businessId, businessDate: hoy },
    _count: { _all: true },
    _sum: { totalCents: true },
  });
  const contar = (estado?: string) => delDia.filter((g) => !estado || g.status === estado).reduce((s, g) => s + g._count._all, 0);
  const entregados = delDia.find((g) => g.status === "DELIVERED");

  return {
    // El cursor es la hora del servidor al consultar, con un margen por relojes y transacciones en curso.
    cursor: new Date(ahora.getTime() - 2_000).toISOString(),
    orders: pedidos.map(pedidoParaPanel),
    resumen: {
      recibidos: contar(),
      entregados: contar("DELIVERED"),
      cancelados: contar("CANCELLED"),
      ventasCents: entregados?._sum.totalCents ?? 0,
    },
    config: { pendingAlertMinutes: negocio.pendingAlertMinutes, acceptingOrders: negocio.acceptingOrders },
  };
}

export async function obtenerPedidoPanel(sesion: UsuarioSesion, orderId: string) {
  if (!puede(sesion.role, "pedidos.ver")) throw new AppError("FORBIDDEN", "No tenés permiso para hacer esto.");
  const pedido = esUuid(orderId) ? await db.order.findFirst({ where: { id: orderId, businessId: sesion.businessId }, include: incluir }) : null;
  if (!pedido) throw noEncontrado("No encontramos este pedido.");
  return pedidoParaPanel(pedido);
}

/** Marcar o desmarcar como cobrado (RF-028), con usuario y hora. */
export async function marcarCobrado(sesion: UsuarioSesion, orderId: string, cobrado: boolean) {
  if (!puede(sesion.role, "pedidos.marcarCobrado")) throw new AppError("FORBIDDEN", "No tenés permiso para hacer esto.");
  const { businessId } = sesion;
  return db.$transaction(async (tx) => {
    const pedido = esUuid(orderId) ? await tx.order.findFirst({ where: { id: orderId, businessId } }) : null;
    if (!pedido) throw noEncontrado("No encontramos este pedido.");
    if (pedido.status === "CANCELLED") throw new AppError("INVALID_TRANSITION", "Un pedido cancelado no se puede marcar como cobrado.");
    const despues = await tx.order.update({
      where: { id: pedido.id },
      data: cobrado ? { paidAt: new Date(), paidBy: sesion.userId } : { paidAt: null, paidBy: null },
      include: incluir,
    });
    await registrarAuditoria(tx, {
      businessId,
      userId: sesion.userId,
      action: cobrado ? "order.marked_paid" : "order.unmarked_paid",
      entityType: "order",
      entityId: pedido.id,
      before: { paidAt: pedido.paidAt },
      after: { paidAt: despues.paidAt },
    });
    return pedidoParaPanel(despues);
  });
}
