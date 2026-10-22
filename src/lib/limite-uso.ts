import "server-only";
import { db } from "./bd";

/**
 * Límites de uso con ventana deslizante guardados en la base (funcionan aunque Vercel reparta las
 * solicitudes entre instancias). Claves: "<acción>:<email|ip|celular>".
 */

export type ReglaLimite = { key: string; limit: number; windowMin: number };

export async function contarEventos(key: string, windowMin: number, ahora = new Date()): Promise<number> {
  return db.rateLimitHit.count({ where: { key, createdAt: { gt: new Date(ahora.getTime() - windowMin * 60_000) } } });
}

export async function registrarEventos(keys: string[], ahora = new Date()) {
  if (!keys.length) return;
  await db.rateLimitHit.createMany({ data: keys.map((key) => ({ key, createdAt: ahora })) });
  // Limpieza ocasional para que la tabla no crezca.
  if (Math.random() < 0.05) {
    await db.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(ahora.getTime() - 2 * 86_400_000) } } });
  }
}

export async function borrarEventos(key: string) {
  await db.rateLimitHit.deleteMany({ where: { key } });
}

/** true si alguna regla ya llegó a su tope. */
export async function superaLimite(reglas: ReglaLimite[], ahora = new Date()): Promise<boolean> {
  const cuentas = await Promise.all(reglas.map((r) => contarEventos(r.key, r.windowMin, ahora)));
  return reglas.some((r, i) => cuentas[i] >= r.limit);
}
