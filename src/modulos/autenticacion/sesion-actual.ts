import "server-only";
import { cookies } from "next/headers";
import { AppError } from "@/lib/errores";
import { puede, tieneRolMinimo, type Permiso, type Rol } from "./permisos";
import { DURACION_SESION_DIAS, NOMBRE_COOKIE, validarSesion, type UsuarioSesion } from "./sesiones";

/**
 * Punto único de autorización del panel: toda ruta de /api/v1/admin y toda página del panel pasa por
 * acá. Ocultar un botón en la interfaz no cuenta como protección.
 */

export async function guardarCookieSesion(token: string) {
  (await cookies()).set(NOMBRE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_SESION_DIAS * 86_400,
  });
}

export async function leerTokenSesion(): Promise<string | undefined> {
  return (await cookies()).get(NOMBRE_COOKIE)?.value;
}

export async function borrarCookieSesion() {
  (await cookies()).delete(NOMBRE_COOKIE);
}

export async function sesionActual(): Promise<UsuarioSesion | null> {
  return validarSesion(await leerTokenSesion());
}

/** Exige sesión y rol mínimo. 401 sin sesión, 403 sin el rol. */
export async function requerirRol(minimo: Rol): Promise<UsuarioSesion> {
  const sesion = await sesionActual();
  if (!sesion) throw new AppError("UNAUTHENTICATED", "Tu sesión terminó. Ingresá de nuevo.");
  if (!tieneRolMinimo(sesion.role, minimo)) throw new AppError("FORBIDDEN", "No tenés permiso para hacer esto.");
  return sesion;
}

export async function requerirPermiso(permiso: Permiso): Promise<UsuarioSesion> {
  const sesion = await requerirRol("STAFF");
  if (!puede(sesion.role, permiso)) throw new AppError("FORBIDDEN", "No tenés permiso para hacer esto.");
  return sesion;
}
