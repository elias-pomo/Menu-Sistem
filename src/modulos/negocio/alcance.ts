/**
 * Identificador de negocio "con origen verificado". Los repositorios solo aceptan este tipo, y solo
 * se obtiene de la sesión (panel) o del slug resuelto en el servidor (público): nunca de un dato que
 * mandó el navegador (sección 11 del plan).
 */
declare const marca: unique symbol;
export type NegocioId = string & { readonly [marca]: "NegocioId" };

/** Solo para el negocio del usuario autenticado (lo usa el módulo de sesiones). */
export function negocioDeSesion(businessId: string): NegocioId {
  return businessId as NegocioId;
}

/** Solo para el negocio resuelto por slug en el servidor, o en el seed y los tests. */
export function negocioResuelto(businessId: string): NegocioId {
  return businessId as NegocioId;
}
