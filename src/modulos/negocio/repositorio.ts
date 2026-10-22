import "server-only";
import { db } from "@/lib/bd";
import { negocioResuelto, type NegocioId } from "./alcance";

/** Resuelve el negocio de una ruta pública. Es el único lugar donde un slug se convierte en NegocioId. */
export async function obtenerNegocioPorSlug(slug: string) {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const negocio = await db.business.findUnique({ where: { slug }, include: { openingHours: true } });
  return negocio ? { ...negocio, id: negocioResuelto(negocio.id) } : null;
}

export async function obtenerNegocio(businessId: NegocioId) {
  return db.business.findUnique({ where: { id: businessId }, include: { openingHours: true } });
}
