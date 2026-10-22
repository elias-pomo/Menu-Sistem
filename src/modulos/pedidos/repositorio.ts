import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Db, Tx } from "@/lib/bd";
import { esUuid } from "@/lib/ids";
import type { NegocioId } from "@/modulos/negocio/alcance";
import type { LineaCalculada } from "./calculo";
import type { EstadoPedido } from "./estados";

/** Acceso a datos de pedidos. Toda función exige el negocio y lo pone en el WHERE. */

export async function obtenerPedido(cliente: Db | Tx, businessId: NegocioId, orderId: string) {
  if (!esUuid(orderId)) return null;
  return cliente.order.findFirst({
    where: { id: orderId, businessId },
    include: {
      items: { orderBy: { position: "asc" }, include: { options: true } },
      statusHistory: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function listarPedidosActivos(cliente: Db | Tx, businessId: NegocioId) {
  return cliente.order.findMany({
    where: { businessId, status: { notIn: ["DELIVERED", "CANCELLED"] } },
    orderBy: { createdAt: "asc" },
    include: { items: { orderBy: { position: "asc" }, include: { options: true } } },
  });
}

/**
 * Cambia el estado solo si sigue siendo el esperado (control de concurrencia optimista). Devuelve
 * false si otro usuario lo cambió antes.
 */
export async function actualizarEstadoSiCoincide(
  tx: Tx,
  businessId: NegocioId,
  orderId: string,
  esperado: EstadoPedido,
  data: Prisma.OrderUpdateManyMutationInput,
): Promise<boolean> {
  const { count } = await tx.order.updateMany({ where: { id: orderId, businessId, status: esperado }, data });
  return count === 1;
}

export type DatosPedidoNuevo = {
  businessDate: Date;
  publicCode: string;
  publicToken: string;
  clientRequestId: string;
  status: EstadoPedido;
  fulfillment: "PICKUP" | "DELIVERY";
  customerName: string;
  customerPhone: string;
  address?: { street: string; number: string; neighborhood: string; unit?: string | null; reference?: string | null };
  note: string | null;
  paymentMethod: "CASH" | "TRANSFER";
  cashChangeForCents: number | null;
  lines: LineaCalculada[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  estimatedMinutes?: number | null;
  createdAt?: Date;
};

/** Inserta un pedido con su copia histórica de ítems y opciones, y la primera fila del historial. */
export async function insertarPedido(tx: Tx, businessId: NegocioId, datos: DatosPedidoNuevo) {
  const creado = datos.createdAt ?? new Date();
  const pedido = await tx.order.create({
    data: {
      businessId,
      businessDate: datos.businessDate,
      publicCode: datos.publicCode,
      publicToken: datos.publicToken,
      clientRequestId: datos.clientRequestId,
      status: datos.status,
      fulfillment: datos.fulfillment,
      customerName: datos.customerName,
      customerPhone: datos.customerPhone,
      addressStreet: datos.address?.street ?? null,
      addressNumber: datos.address?.number ?? null,
      addressNeighborhood: datos.address?.neighborhood ?? null,
      addressUnit: datos.address?.unit ?? null,
      addressReference: datos.address?.reference ?? null,
      note: datos.note,
      paymentMethod: datos.paymentMethod,
      cashChangeForCents: datos.cashChangeForCents,
      subtotalCents: datos.subtotalCents,
      deliveryFeeCents: datos.deliveryFeeCents,
      totalCents: datos.totalCents,
      estimatedMinutes: datos.estimatedMinutes ?? null,
      createdAt: creado,
      ...(datos.status === "CONFIRMED" && { confirmedAt: creado }),
    },
  });

  for (const linea of datos.lines) {
    await tx.orderItem.create({
      data: {
        businessId,
        orderId: pedido.id,
        productId: linea.productId,
        productName: linea.productName,
        categoryName: linea.categoryName,
        unitPriceCents: linea.unitPriceCents,
        optionsTotalCents: linea.optionsTotalCents,
        quantity: linea.quantity,
        lineTotalCents: linea.lineTotalCents,
        note: linea.note,
        position: linea.position,
        options: {
          create: linea.options.map((o) => ({
            optionId: o.optionId,
            groupName: o.groupName,
            optionName: o.optionName,
            kind: o.kind,
            priceDeltaCents: o.priceDeltaCents,
          })),
        },
      },
    });
  }

  await tx.orderStatusHistory.create({
    data: { businessId, orderId: pedido.id, fromStatus: null, toStatus: datos.status, userId: null, createdAt: creado },
  });
  return pedido;
}
