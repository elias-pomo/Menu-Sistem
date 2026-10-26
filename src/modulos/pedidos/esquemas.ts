import { z } from "zod";
import { MAX_CENTAVOS } from "@/lib/dinero";
import { normalizarCelularAR } from "@/lib/telefono";
import { LIMITES_PEDIDO } from "./calculo";

/**
 * Pedido que manda el navegador (sección 15 del plan, RF-009 a RF-014). Archivo puro: lo usa el
 * formulario para mostrar errores y el servidor para validar. Los precios que vengan solo sirven
 * para detectar cambios; nunca para calcular (RN-03).
 */

/** Recorta espacios; vacío pasa a null. */
const textoOpcional = (max: number, mensaje: string) =>
  z
    .string()
    .max(max * 2) // tope bruto antes de recortar
    .nullish()
    .transform((v) => v?.trim() || null)
    .refine((v) => v === null || v.length <= max, mensaje);

const texto = (max: number, falta: string, largo: string) =>
  z
    .string({ error: falta })
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, falta)
    .refine((v) => v.length <= max, largo);

export const ItemPedido = z
  .object({
    productId: z.uuid("Producto inválido."),
    quantity: z.number().int().min(LIMITES_PEDIDO.minQuantity).max(LIMITES_PEDIDO.maxQuantity),
    optionIds: z.array(z.uuid()).max(30).default([]),
    note: textoOpcional(LIMITES_PEDIDO.maxItemNote, `La nota puede tener hasta ${LIMITES_PEDIDO.maxItemNote} caracteres.`),
    expectedUnitCents: z.number().int().min(0).max(MAX_CENTAVOS).optional(),
  })
  .strict();

export const PedidoNuevo = z
  .object({
    clientRequestId: z.uuid(),
    menuVersion: z.number().int().min(0),
    fulfillment: z.enum(["PICKUP", "DELIVERY"], { error: "Elegí retiro o delivery." }),
    customer: z
      .object({
        name: texto(80, "Ingresá tu nombre.", "El nombre puede tener hasta 80 caracteres."),
        phone: z
          .string({ error: "Ingresá tu celular." })
          .max(30, "Revisá el número.")
          .transform((v, ctx) => {
            const e164 = normalizarCelularAR(v);
            if (!e164) {
              ctx.addIssue({ code: "custom", message: "Ingresá un celular válido, con código de área (ej.: 381 555 1234)." });
              return z.NEVER;
            }
            return e164;
          }),
      })
      .strict(),
    address: z
      .object({
        street: texto(80, "Ingresá la calle.", "Hasta 80 caracteres."),
        number: texto(10, "Ingresá la altura.", "Hasta 10 caracteres."),
        neighborhood: texto(60, "Ingresá el barrio.", "Hasta 60 caracteres."),
        unit: textoOpcional(20, "Hasta 20 caracteres."),
        reference: textoOpcional(120, "Hasta 120 caracteres."),
      })
      .strict()
      .nullish(),
    payment: z
      .object({
        method: z.enum(["CASH", "TRANSFER"], { error: "Elegí cómo vas a pagar." }),
        /** "Pago con" en efectivo, en centavos. */
        changeFor: z.number().int().min(0).max(MAX_CENTAVOS).nullish(),
      })
      .strict(),
    note: textoOpcional(LIMITES_PEDIDO.maxOrderNote, `La nota puede tener hasta ${LIMITES_PEDIDO.maxOrderNote} caracteres.`),
    items: z.array(ItemPedido).min(1, "El pedido no tiene productos.").max(LIMITES_PEDIDO.maxItems),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.fulfillment === "DELIVERY" && !p.address) {
      ctx.addIssue({ code: "custom", path: ["address", "street"], message: "Ingresá la dirección de entrega." });
    }
  });

export type PedidoNuevoDatos = z.infer<typeof PedidoNuevo>;

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

export const Transicion = z
  .object({
    toStatus: z.enum(["PENDING", "CONFIRMED", "PREPARING", "READY", "ON_THE_WAY", "DELIVERED"]),
    expectedStatus: z.enum(["PENDING", "CONFIRMED", "PREPARING", "READY", "ON_THE_WAY", "DELIVERED", "CANCELLED"]),
    estimatedMinutes: z.number().int().min(1).max(480).nullish(),
    reason: textoOpcional(300, "Hasta 300 caracteres."),
  })
  .strict();

export const Cancelacion = z
  .object({
    expectedStatus: z.enum(["PENDING", "CONFIRMED", "PREPARING", "READY", "ON_THE_WAY"]),
    reason: z.enum(Object.keys(MOTIVOS_CANCELACION) as [MotivoCancelacion, ...MotivoCancelacion[]], { error: "Elegí un motivo." }),
    note: textoOpcional(200, "Hasta 200 caracteres."),
  })
  .strict();

export const Cobro = z.object({ paid: z.boolean() }).strict();
