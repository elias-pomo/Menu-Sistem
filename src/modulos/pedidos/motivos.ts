/**
 * Motivos de cancelación (sección 16 del plan). Archivo puro y sin zod: lo usa el panel en el navegador
 * sin cargar los esquemas (zod y libphonenumber).
 */
export const MOTIVOS_CANCELACION = {
  OUT_OF_STOCK: "Sin stock",
  OUT_OF_ZONE: "Fuera de zona",
  CLOSED: "Cerrado",
  INVALID_DATA: "Datos inválidos",
  DUPLICATE: "Pedido duplicado",
  CUSTOMER_REQUEST: "Lo pidió el cliente",
  OTHER: "Otro",
} as const;

export type MotivoCancelacion = keyof typeof MOTIVOS_CANCELACION;
