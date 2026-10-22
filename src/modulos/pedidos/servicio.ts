import "server-only";
import type { CancelReason, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/bd";
import { AppError, noEncontrado } from "@/lib/errores";
import { registrarAuditoria } from "@/modulos/auditoria";
import type { UsuarioSesion } from "@/modulos/autenticacion";
import { evaluarTransicion, MARCA_DE_TIEMPO, type EstadoPedido } from "./estados";
import { actualizarEstadoSiCoincide, obtenerPedido } from "./repositorio";

export type CambioDeEstado = {
  toStatus: EstadoPedido;
  expectedStatus: EstadoPedido;
  estimatedMinutes?: number | null;
  /** Motivo escrito: obligatorio al retroceder; nota opcional al cancelar. */
  reason?: string | null;
  /** Motivo de la lista: obligatorio al cancelar. */
  cancelReason?: CancelReason | null;
};

/**
 * Cambia el estado de un pedido (RN-13, RN-14). Valida transición y rol, aplica el cambio solo si el
 * estado sigue siendo el esperado y deja la fila del historial en la misma transacción.
 */
export async function cambiarEstado(sesion: UsuarioSesion, orderId: string, cambio: CambioDeEstado) {
  const pedido = await obtenerPedido(db, sesion.businessId, orderId);
  if (!pedido) throw noEncontrado("No encontramos este pedido.");

  if (pedido.status !== cambio.expectedStatus) {
    throw new AppError("STATUS_CONFLICT", "Otro usuario ya cambió este pedido.", { details: [{ status: pedido.status }] });
  }

  const cancelando = cambio.toStatus === "CANCELLED";
  const evaluacion = evaluarTransicion({
    from: pedido.status,
    to: cambio.toStatus,
    fulfillment: pedido.fulfillment,
    role: sesion.role,
    reason: cancelando ? cambio.cancelReason : cambio.reason,
  });
  if (!evaluacion.ok) {
    if (evaluacion.code === "FORBIDDEN") throw new AppError("FORBIDDEN", "No tenés permiso para hacer esto.");
    if (evaluacion.code === "REASON_REQUIRED") {
      throw new AppError("VALIDATION_ERROR", "Falta el motivo.", { fields: { reason: "Indicá el motivo." } });
    }
    throw new AppError("INVALID_TRANSITION", "Ese cambio de estado no está permitido.");
  }

  const ahora = new Date();
  const data: Prisma.OrderUpdateManyMutationInput = { status: cambio.toStatus };
  const marcaNueva = MARCA_DE_TIEMPO[cambio.toStatus];
  if (marcaNueva) data[marcaNueva] = ahora;
  if (evaluacion.tipo === "RETROCESO") {
    // Al volver atrás, la marca del estado que se deja ya no vale.
    const marcaVieja = MARCA_DE_TIEMPO[pedido.status];
    if (marcaVieja) data[marcaVieja] = null;
  }
  if (cambio.toStatus === "CONFIRMED" && cambio.estimatedMinutes) data.estimatedMinutes = cambio.estimatedMinutes;
  if (cancelando) {
    data.cancelReason = cambio.cancelReason;
    data.cancelNote = cambio.reason?.trim() || null;
  }

  return db.$transaction(async (tx) => {
    const aplicado = await actualizarEstadoSiCoincide(tx, sesion.businessId, pedido.id, cambio.expectedStatus, data);
    if (!aplicado) throw new AppError("STATUS_CONFLICT", "Otro usuario ya cambió este pedido.");

    await tx.orderStatusHistory.create({
      data: {
        businessId: sesion.businessId,
        orderId: pedido.id,
        fromStatus: pedido.status,
        toStatus: cambio.toStatus,
        userId: sesion.userId,
        reason: cancelando ? (cambio.cancelReason ?? null) : (cambio.reason?.trim() ?? null),
        createdAt: ahora,
      },
    });

    if (cancelando || evaluacion.tipo === "RETROCESO") {
      await registrarAuditoria(tx, {
        businessId: sesion.businessId,
        userId: sesion.userId,
        action: cancelando ? "order.cancelled" : "order.status_reverted",
        entityType: "order",
        entityId: pedido.id,
        before: { status: pedido.status },
        after: { status: cambio.toStatus, reason: cambio.reason ?? null, cancelReason: cambio.cancelReason ?? null },
      });
    }

    return tx.order.findFirstOrThrow({ where: { id: pedido.id, businessId: sesion.businessId } });
  });
}
