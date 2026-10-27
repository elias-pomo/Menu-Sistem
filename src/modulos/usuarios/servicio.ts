import "server-only";
import { db, type Tx } from "@/lib/bd";
import { AppError, noEncontrado } from "@/lib/errores";
import { esUuid } from "@/lib/ids";
import { generarContrasenaTemporal } from "@/lib/tokens";
import { registrarAuditoria } from "@/modulos/auditoria";
import { puede } from "@/modulos/autenticacion/permisos";
import { hashearContrasena, normalizarEmail, type UsuarioSesion } from "@/modulos/autenticacion";
import type { UsuarioCambiosDatos, UsuarioNuevoDatos } from "./esquemas";

/**
 * Usuarios del local (Fase 6b, RF-037). Solo el dueño. Reglas:
 * - RN-20: el negocio siempre conserva al menos un dueño activo.
 * - Nadie se desactiva ni se cambia el rol a sí mismo (evita quedarse afuera por error).
 * - Desactivar a alguien cierra sus sesiones y borra sus avisos push en el mismo momento.
 * - La contraseña inicial la genera el servidor y se muestra una sola vez.
 */

function exigirDueno(sesion: UsuarioSesion) {
  if (!puede(sesion.role, "usuarios.gestionar")) throw new AppError("FORBIDDEN", "No tenés permiso para hacer esto.");
}

const campoInvalido = (campo: string, mensaje: string) => new AppError("VALIDATION_ERROR", "Revisá los datos.", { fields: { [campo]: mensaje } });

const columnas = { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true } as const;

export async function listarUsuarios(sesion: UsuarioSesion) {
  exigirDueno(sesion);
  return db.appUser.findMany({
    where: { businessId: sesion.businessId },
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }], // el enum va OWNER, MANAGER, STAFF
    select: columnas,
  });
}

/** Crea el usuario con una contraseña temporal, que se devuelve una sola vez y nunca se guarda en claro. */
export async function crearUsuario(sesion: UsuarioSesion, datos: UsuarioNuevoDatos) {
  exigirDueno(sesion);
  const email = normalizarEmail(datos.email);
  // El email es único en toda la plataforma: el mensaje no dice de qué negocio es.
  if (await db.appUser.findUnique({ where: { email }, select: { id: true } })) throw campoInvalido("email", "Ese email ya tiene un usuario.");
  const contrasena = generarContrasenaTemporal();
  const passwordHash = await hashearContrasena(contrasena);
  const usuario = await db.$transaction(async (tx) => {
    const creado = await tx.appUser.create({
      data: { businessId: sesion.businessId, email, name: datos.name, role: datos.role, passwordHash },
      select: columnas,
    });
    await auditar(tx, sesion, "user.created", creado.id, null, { name: creado.name, email, role: creado.role });
    return creado;
  });
  return { usuario, contrasenaTemporal: contrasena };
}

export async function cambiarUsuario(sesion: UsuarioSesion, userId: string, cambios: UsuarioCambiosDatos) {
  exigirDueno(sesion);
  const actual = await buscar(sesion, userId);
  const esUnoMismo = actual.id === sesion.userId;
  if (esUnoMismo && cambios.isActive === false) throw new AppError("FORBIDDEN", "No podés desactivar tu propio usuario.");
  if (esUnoMismo && cambios.role && cambios.role !== actual.role) throw new AppError("FORBIDDEN", "No podés cambiar tu propio rol.");

  return db.$transaction(async (tx) => {
    const actualizado = await tx.appUser.update({ where: { id: actual.id }, data: cambios, select: columnas });
    // RN-20, dentro de la transacción: si el cambio deja al negocio sin dueño activo, se deshace.
    if (actual.role === "OWNER" && actual.isActive && (actualizado.role !== "OWNER" || !actualizado.isActive)) {
      const duenos = await tx.appUser.count({ where: { businessId: sesion.businessId, role: "OWNER", isActive: true } });
      if (duenos === 0) throw new AppError("LAST_OWNER", "El negocio necesita al menos un dueño activo.");
    }
    if (actual.isActive && !actualizado.isActive) {
      await tx.session.deleteMany({ where: { userId: actual.id } });
      await tx.pushSubscription.deleteMany({ where: { userId: actual.id, businessId: sesion.businessId } });
    } else if (cambios.role && cambios.role !== actual.role) {
      // El rol se lee de la base en cada solicitud; se cierran las sesiones igual para que el panel
      // abierto vuelva a cargar con los permisos nuevos.
      await tx.session.deleteMany({ where: { userId: actual.id } });
    }
    await auditar(tx, sesion, accionDe(actual, actualizado), actual.id, { name: actual.name, role: actual.role, isActive: actual.isActive }, cambios);
    return actualizado;
  });
}

/** Nueva contraseña temporal para un usuario que se olvidó la suya. Cierra sus sesiones. */
export async function restablecerContrasena(sesion: UsuarioSesion, userId: string) {
  exigirDueno(sesion);
  const actual = await buscar(sesion, userId);
  if (actual.id === sesion.userId) throw new AppError("FORBIDDEN", "Para tu propia contraseña usá “Cambiar mi contraseña”.");
  if (!actual.isActive) throw new AppError("EDIT_CONFLICT", "Reactivá el usuario antes de darle una contraseña nueva.");
  const contrasena = generarContrasenaTemporal();
  const passwordHash = await hashearContrasena(contrasena);
  await db.$transaction(async (tx) => {
    await tx.appUser.update({ where: { id: actual.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: actual.id } });
    await auditar(tx, sesion, "user.password_reset", actual.id, null, null);
  });
  return { contrasenaTemporal: contrasena };
}

/** Por ID y siempre dentro del negocio de la sesión: si es de otro negocio, 404. */
async function buscar(sesion: UsuarioSesion, userId: string) {
  if (!esUuid(userId)) throw noEncontrado("No encontramos este usuario.");
  const usuario = await db.appUser.findFirst({ where: { id: userId, businessId: sesion.businessId }, select: columnas });
  if (!usuario) throw noEncontrado("No encontramos este usuario.");
  return usuario;
}

function accionDe(antes: { isActive: boolean; role: string }, despues: { isActive: boolean; role: string }) {
  if (antes.isActive && !despues.isActive) return "user.deactivated";
  if (!antes.isActive && despues.isActive) return "user.reactivated";
  if (antes.role !== despues.role) return "user.role_changed";
  return "user.updated";
}

function auditar(tx: Tx, sesion: UsuarioSesion, action: string, entityId: string, before: unknown, after: unknown) {
  return registrarAuditoria(tx, { businessId: sesion.businessId, userId: sesion.userId, action, entityType: "app_user", entityId, before, after });
}
