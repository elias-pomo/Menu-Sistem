"use client";

/** Llamadas del panel a /api/v1/admin con el formato de error único de la API. */

export class ErrorApi extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
    readonly status = 0,
  ) {
    super(message);
  }
}

export async function llamarApi<T = unknown>(metodo: "GET" | "POST" | "PATCH" | "DELETE", url: string, cuerpo?: unknown): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi("NETWORK", "No hay conexión. Probá de nuevo.");
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const error = datos?.error;
    // Sesión vencida: recarga completa al ingreso, para no dejar datos del panel en memoria. En el
    // ingreso mismo, un 401 son datos incorrectos y se muestran ahí.
    if (respuesta.status === 401 && window.location.pathname !== "/admin/ingresar") {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa a propósito
      window.location.assign("/admin/ingresar");
    }
    throw new ErrorApi(error?.code ?? "INTERNAL_ERROR", error?.message ?? "Ocurrió un error.", error?.fields, respuesta.status);
  }
  return datos as T;
}
