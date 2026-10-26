import "server-only";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import type { z } from "zod";
import { AppError, respuestaError } from "./errores";

/**
 * Ayudantes de las rutas REST (sección 15 del plan): un requestId por solicitud, formato único de
 * error, cuerpo JSON validado con Zod y control de origen en las escrituras (CSRF).
 */

export function nuevoRequestId() {
  return `req_${randomUUID()}`;
}

/** Ejecuta el handler y convierte cualquier error en la respuesta de error de la API. */
export async function manejar(handler: (requestId: string) => Promise<Response>): Promise<Response> {
  const requestId = nuevoRequestId();
  // Las rutas de la API son siempre dinámicas. Fuera del try: la señal con la que Next corta el
  // prerender no tiene que terminar convertida en un error 500.
  await connection();
  try {
    return await handler(requestId);
  } catch (error) {
    if (!(error instanceof AppError)) console.error(JSON.stringify({ requestId, error: String(error) }));
    return respuestaError(error, requestId);
  }
}

/**
 * Escrituras: solo JSON y solo desde el propio origen. Junto con la cookie SameSite=Lax evita que
 * otro sitio dispare acciones con la sesión del usuario.
 */
export function verificarEscritura(request: Request) {
  const tipo = request.headers.get("content-type") ?? "";
  if (!tipo.toLowerCase().startsWith("application/json")) {
    throw new AppError("VALIDATION_ERROR", "El cuerpo tiene que ser JSON.");
  }
  verificarOrigen(request);
}

/** Escrituras sin cuerpo (DELETE): solo el control de origen. */
export function verificarOrigen(request: Request) {
  const origen = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origen || !host || new URL(origen).host !== host) {
    throw new AppError("FORBIDDEN", "Origen no permitido.");
  }
}

/** Mapea los errores de Zod a { "campo.anidado": "mensaje" }. */
export function camposDeError(error: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const issue of error.issues) {
    const clave = issue.path.join(".") || "_";
    campos[clave] ??= issue.message;
  }
  return campos;
}

export async function leerCuerpo<T extends z.ZodType>(request: Request, esquema: T): Promise<z.infer<T>> {
  verificarEscritura(request);
  let datos: unknown;
  try {
    datos = await request.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "El cuerpo no es JSON válido.");
  }
  const resultado = esquema.safeParse(datos);
  if (!resultado.success) {
    throw new AppError("VALIDATION_ERROR", "Revisá los datos.", { fields: camposDeError(resultado.error) });
  }
  return resultado.data;
}

/** IP del visitante según el proxy de Vercel. */
export function ipDe(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
}
