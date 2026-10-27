import { z } from "zod";
import { esColorValido } from "@/lib/color";
import { MAX_CENTAVOS } from "@/lib/dinero";

/** Validación de la configuración del negocio (RF-034, RF-035). Archivo puro: lo usa también el panel. */

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Hasta ${max} caracteres.`)
    .nullish()
    .transform((v) => v || null);

const centavos = z
  .number({ error: "Ingresá un importe." })
  .int("El importe va en centavos enteros.")
  .min(0, "El importe no puede ser negativo.")
  .max(MAX_CENTAVOS, "Importe demasiado grande.");

const minutoDelDia = z.number().int().min(0).max(1439);

/** Datos del local que se ven en el menú (permiso `negocio.datos`, encargado o más). */
export const DatosNegocio = z
  .object({
    name: z.string().trim().min(2, "Falta el nombre.").max(80, "Nombre: hasta 80 caracteres."),
    address: textoOpcional(160),
    // Lo que escribió el local; el servidor lo pasa a E.164 o lo rechaza.
    whatsapp: textoOpcional(30),
    logoUrl: z
      .url({ protocol: /^https$/, hostname: /\.public\.blob\.vercel-storage\.com$/, error: "Subí el logo desde el panel." })
      .nullish()
      .transform((v) => v || null),
    primaryColor: z.string().refine(esColorValido, "Elegí un color válido."),
    showPhotos: z.boolean(),
    showDescriptions: z.boolean(),
  })
  .strict();
export type DatosNegocioDatos = z.infer<typeof DatosNegocio>;

/** Horario semanal completo: reemplaza todas las franjas (permiso `negocio.horarios`). */
export const Horarios = z
  .array(
    z
      .object({ weekday: z.number().int().min(0).max(6), opensMin: minutoDelDia, closesMin: minutoDelDia })
      .strict()
      .refine((f) => f.opensMin !== f.closesMin, "La apertura y el cierre no pueden ser iguales."),
  )
  .max(28, "Demasiadas franjas.");
export type HorariosDatos = z.infer<typeof Horarios>;

/** Envío, pedido mínimo y medios de pago (permiso `negocio.envioYPagos`, solo el dueño). */
export const EnvioYPagos = z
  .object({
    deliveryEnabled: z.boolean(),
    deliveryFeeCents: centavos,
    minOrderCents: centavos,
    acceptCash: z.boolean(),
    acceptTransfer: z.boolean(),
    transferAlias: textoOpcional(60),
    transferHolder: textoOpcional(80),
    autoConfirm: z.boolean(),
    pendingAlertMinutes: z.number().int().min(5, "Mínimo 5 minutos.").max(120, "Máximo 120 minutos."),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.acceptCash && !v.acceptTransfer) ctx.addIssue({ code: "custom", path: ["acceptCash"], message: "Dejá al menos un medio de pago." });
    if (v.acceptTransfer && !v.transferAlias) ctx.addIssue({ code: "custom", path: ["transferAlias"], message: "Falta el alias o CBU para la transferencia." });
  });
export type EnvioYPagosDatos = z.infer<typeof EnvioYPagos>;

/** PATCH /admin/settings: cada sección es opcional y se valida y autoriza por separado. */
export const CambiosAjustes = z
  .object({ datos: DatosNegocio.optional(), horarios: Horarios.optional(), envioYPagos: EnvioYPagos.optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "No hay cambios.");
export type CambiosAjustesDatos = z.infer<typeof CambiosAjustes>;

export const Pausa = z
  .object({ paused: z.boolean(), message: textoOpcional(200) })
  .strict();
