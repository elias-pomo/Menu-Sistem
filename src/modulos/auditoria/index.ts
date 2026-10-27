import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Db, Tx } from "@/lib/bd";
import type { NegocioId } from "@/modulos/negocio/alcance";

/**
 * Historial administrativo (RN-19): una sola función para registrar acciones. Recibe el cliente de
 * la transacción, así el registro se guarda junto con el cambio o no se guarda.
 */

// Nunca se guardan secretos en before/after, aunque vengan en el objeto.
const CLAVES_SENSIBLES = /password|contrasena|token|secret|hash|p256dh|auth$/i;

export function limpiarParaAuditoria(valor: unknown): Prisma.InputJsonValue | undefined {
  if (valor === undefined || valor === null) return undefined;
  return JSON.parse(
    JSON.stringify(valor, (clave, v) => (clave && CLAVES_SENSIBLES.test(clave) ? undefined : v)),
  ) as Prisma.InputJsonValue;
}

export type AccionAuditada = {
  businessId: NegocioId;
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

export async function registrarAuditoria(cliente: Db | Tx, accion: AccionAuditada) {
  await cliente.auditLog.create({
    data: {
      businessId: accion.businessId,
      userId: accion.userId,
      action: accion.action,
      entityType: accion.entityType,
      entityId: accion.entityId ?? null,
      before: limpiarParaAuditoria(accion.before),
      after: limpiarParaAuditoria(accion.after),
    },
  });
}

export * from "./historial";
