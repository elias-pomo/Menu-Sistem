/**
 * Error de aplicación con el formato único de la API (sección 15 del plan). Los mensajes son para el
 * usuario, en español y sin detalles internos.
 */

export const ESTADO_HTTP = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  MENU_CHANGED: 409,
  STATUS_CONFLICT: 409,
  EDIT_CONFLICT: 409,
  INVALID_TRANSITION: 422,
  MIN_ORDER_NOT_REACHED: 422,
  NOT_ACCEPTING_ORDERS: 422,
  DELIVERY_DISABLED: 422,
  PAYMENT_METHOD_DISABLED: 422,
  LAST_OWNER: 422,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type CodigoError = keyof typeof ESTADO_HTTP;

export class AppError extends Error {
  readonly code: CodigoError;
  readonly fields?: Record<string, string>;
  readonly details?: unknown[];

  constructor(code: CodigoError, message: string, extra: { fields?: Record<string, string>; details?: unknown[] } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fields = extra.fields;
    this.details = extra.details;
  }

  get status(): number {
    return ESTADO_HTTP[this.code];
  }
}

/** 404 uniforme: no distingue "no existe" de "es de otro negocio". */
export const noEncontrado = (mensaje = "No encontramos lo que buscás.") => new AppError("NOT_FOUND", mensaje);

/** Respuesta JSON de error. Un error desconocido se responde como 500 genérico, sin detalles. */
export function respuestaError(error: unknown, requestId: string): Response {
  if (error instanceof AppError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields && { fields: error.fields }),
          ...(error.details && { details: error.details }),
          requestId,
        },
      },
      { status: error.status },
    );
  }
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Ocurrió un error. Probá de nuevo en unos segundos.", requestId } },
    { status: 500 },
  );
}
