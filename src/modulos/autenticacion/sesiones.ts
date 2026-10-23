import "server-only";
import { db } from "@/lib/bd";
import { generarTokenSesion, sha256Hex } from "@/lib/tokens";
import { negocioDeSesion, type NegocioId } from "@/modulos/negocio/alcance";
import type { Rol } from "./permisos";

/**
 * Sesiones del panel (ADR-007): token aleatorio de 256 bits en la cookie; en la base solo su hash.
 * Vencen a los 14 días y se renuevan solas cuando se usan después de la mitad de su vida.
 */

export const DURACION_SESION_DIAS = 14;
const DURACION_MS = DURACION_SESION_DIAS * 86_400_000;
// Al usarse, last_seen_at se actualiza como mucho una vez cada 5 minutos.
const INTERVALO_ULTIMO_USO_MS = 5 * 60_000;

/** En producción, el prefijo __Host- obliga a Secure, path=/ y sin Domain. */
export { NOMBRE_COOKIE } from "./cookie";

export type UsuarioSesion = {
  userId: string;
  businessId: NegocioId;
  role: Rol;
  name: string;
  email: string;
  sessionHash: string;
  expiresAt: Date;
};

export async function crearSesion(userId: string, userAgent: string | null, ahora = new Date()) {
  const token = generarTokenSesion();
  const expiresAt = new Date(ahora.getTime() + DURACION_MS);
  await db.session.create({
    data: {
      id: sha256Hex(token),
      userId,
      expiresAt,
      createdAt: ahora,
      lastSeenAt: ahora,
      userAgent: userAgent?.slice(0, 300) ?? null,
    },
  });
  return { token, expiresAt };
}

/**
 * Valida el token de la cookie. Devuelve null si no existe, venció o el usuario está desactivado.
 * Renueva el vencimiento si ya pasó la mitad de la vida de la sesión.
 */
export async function validarSesion(token: string | undefined, ahora = new Date()): Promise<UsuarioSesion | null> {
  if (!token || token.length > 100) return null;
  const id = sha256Hex(token);
  const sesion = await db.session.findUnique({ where: { id }, include: { user: true } });
  if (!sesion) return null;

  if (sesion.expiresAt <= ahora || !sesion.user.isActive) {
    await db.session.deleteMany({ where: { id } });
    return null;
  }

  let { expiresAt } = sesion;
  const renovar = expiresAt.getTime() - ahora.getTime() < DURACION_MS / 2;
  if (renovar) expiresAt = new Date(ahora.getTime() + DURACION_MS);
  if (renovar || ahora.getTime() - sesion.lastSeenAt.getTime() > INTERVALO_ULTIMO_USO_MS) {
    await db.session.update({ where: { id }, data: { expiresAt, lastSeenAt: ahora } });
  }

  const { user } = sesion;
  return {
    userId: user.id,
    businessId: negocioDeSesion(user.businessId),
    role: user.role,
    name: user.name,
    email: user.email,
    sessionHash: id,
    expiresAt,
  };
}

export async function cerrarSesion(token: string | undefined) {
  if (!token) return;
  await db.session.deleteMany({ where: { id: sha256Hex(token) } });
}

/** Al cambiar la contraseña o desactivar un usuario: cierra todas sus sesiones (menos una, si se indica). */
export async function cerrarSesionesDeUsuario(userId: string, excepto?: string) {
  await db.session.deleteMany({ where: { userId, ...(excepto && { id: { not: excepto } }) } });
}

export async function borrarSesionesVencidas(ahora = new Date()) {
  await db.session.deleteMany({ where: { expiresAt: { lte: ahora } } });
}
