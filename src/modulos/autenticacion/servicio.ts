import "server-only";
import { db } from "@/lib/bd";
import { AppError } from "@/lib/errores";
import { borrarEventos, registrarEventos, superaLimite } from "@/lib/limite-uso";
import { registrarAuditoria } from "@/modulos/auditoria";
import { negocioDeSesion } from "@/modulos/negocio/alcance";
import { hashearContrasena, obtenerHashSenuelo, problemaConContrasena, verificarContrasena } from "./contrasenas";
import { cerrarSesionesDeUsuario, crearSesion } from "./sesiones";

/** 5 intentos fallidos por email y por IP cada 15 minutos (sección 17 del plan). */
export const LIMITE_LOGIN = { porEmail: 5, porIp: 5, ventanaMin: 15 };

const claveEmail = (email: string) => `login-email:${email}`;
const claveIp = (ip: string) => `login-ip:${ip}`;

export function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

const DATOS_INCORRECTOS = new AppError("UNAUTHENTICATED", "Datos incorrectos.");

export async function iniciarSesion(params: {
  email: string;
  password: string;
  ip: string | null;
  userAgent: string | null;
  ahora?: Date;
}) {
  const ahora = params.ahora ?? new Date();
  const email = normalizarEmail(params.email);
  const reglas = [
    { key: claveEmail(email), limit: LIMITE_LOGIN.porEmail, windowMin: LIMITE_LOGIN.ventanaMin },
    ...(params.ip ? [{ key: claveIp(params.ip), limit: LIMITE_LOGIN.porIp, windowMin: LIMITE_LOGIN.ventanaMin }] : []),
  ];
  if (await superaLimite(reglas, ahora)) {
    throw new AppError("RATE_LIMITED", "Demasiados intentos. Esperá unos minutos y probá de nuevo.");
  }

  const usuario = await db.appUser.findUnique({ where: { email } });
  // Se verifica igual contra un hash señuelo, para que la respuesta tarde lo mismo.
  const valida = await verificarContrasena(usuario?.passwordHash ?? (await obtenerHashSenuelo()), params.password);

  if (!usuario || !usuario.isActive || !valida) {
    await registrarEventos(reglas.map((r) => r.key), ahora);
    throw DATOS_INCORRECTOS;
  }

  await borrarEventos(claveEmail(email));
  await db.appUser.update({ where: { id: usuario.id }, data: { lastLoginAt: ahora } });
  await registrarAuditoria(db, {
    businessId: negocioDeSesion(usuario.businessId),
    userId: usuario.id,
    action: "auth.login",
    entityType: "app_user",
    entityId: usuario.id,
  });
  return crearSesion(usuario.id, params.userAgent, ahora);
}

/** Pide la contraseña actual; al cambiarla se cierran las demás sesiones del usuario. */
export async function cambiarContrasena(params: {
  userId: string;
  sessionHash: string;
  actual: string;
  nueva: string;
}) {
  const usuario = await db.appUser.findUnique({ where: { id: params.userId } });
  if (!usuario || !(await verificarContrasena(usuario.passwordHash, params.actual))) {
    throw new AppError("VALIDATION_ERROR", "Revisá los datos.", { fields: { actual: "La contraseña actual no es correcta." } });
  }
  const problema = problemaConContrasena(params.nueva);
  if (problema) throw new AppError("VALIDATION_ERROR", "Revisá los datos.", { fields: { nueva: problema } });

  await db.appUser.update({ where: { id: usuario.id }, data: { passwordHash: await hashearContrasena(params.nueva) } });
  await cerrarSesionesDeUsuario(usuario.id, params.sessionHash);
  await registrarAuditoria(db, {
    businessId: negocioDeSesion(usuario.businessId),
    userId: usuario.id,
    action: "auth.password_changed",
    entityType: "app_user",
    entityId: usuario.id,
  });
}
