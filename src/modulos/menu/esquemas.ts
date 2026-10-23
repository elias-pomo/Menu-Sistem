import { z } from "zod";
import { MAX_CENTAVOS } from "@/lib/dinero";

/** Validación de las escrituras del menú desde el panel (RF-030 a RF-033). Archivo puro. */

const texto = (max: number, nombre: string) =>
  z
    .string()
    .trim()
    .min(1, `Falta ${nombre}.`)
    .max(max, `${nombre[0].toUpperCase()}${nombre.slice(1)}: hasta ${max} caracteres.`);

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

const uuid = z.uuid("ID inválido.");

export const CategoriaNueva = z.object({ name: texto(60, "el nombre") }).strict();

export const CategoriaCambios = z
  .object({ name: texto(60, "el nombre").optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "No hay cambios.");

export const Orden = z.object({ ids: z.array(uuid).min(1).max(500) }).strict();

export const Producto = z
  .object({
    categoryId: uuid,
    name: texto(120, "el nombre"),
    description: textoOpcional(500),
    priceCents: centavos,
    // Solo fotos subidas desde el panel (Vercel Blob), nunca una URL de otro sitio.
    imageUrl: z
      .url({ protocol: /^https$/, hostname: /\.public\.blob\.vercel-storage\.com$/, error: "Subí la foto desde el panel." })
      .max(500)
      .nullish()
      .transform((v) => v || null),
    tags: z.array(z.string().trim().min(1).max(20)).max(5, "Hasta 5 etiquetas.").default([]),
    groupIds: z.array(uuid).max(10, "Hasta 10 grupos de opciones.").default([]),
  })
  .strict();

export const ProductoCambios = Producto.partial().strict().extend({
  /** Control de concurrencia: si otro usuario lo editó después, 409. */
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});

export const Disponibilidad = z
  .union([z.object({ isActive: z.boolean() }).strict(), z.object({ isSoldOut: z.boolean() }).strict()])
  .describe("Un solo campo por llamada.");

const Opcion = z
  .object({
    /** Sin id = opción nueva. */
    id: uuid.optional(),
    name: texto(80, "el nombre de la opción"),
    priceDeltaCents: centavos.default(0),
    isAvailable: z.boolean().default(true),
  })
  .strict();

export const Grupo = z
  .object({
    name: texto(60, "el nombre"),
    kind: z.enum(["CHOICE", "REMOVE"]),
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(1).max(20),
    options: z.array(Opcion).min(1, "Agregá al menos una opción.").max(30),
  })
  .strict()
  .refine((g) => g.maxSelect >= g.minSelect, { message: "El máximo no puede ser menor que el mínimo.", path: ["maxSelect"] })
  .refine((g) => g.minSelect <= g.options.filter((o) => o.isAvailable).length, {
    message: "El mínimo es mayor que las opciones disponibles.",
    path: ["minSelect"],
  });

export type ProductoDatos = z.infer<typeof Producto>;
export type ProductoCambiosDatos = z.infer<typeof ProductoCambios>;
export type GrupoDatos = z.infer<typeof Grupo>;
