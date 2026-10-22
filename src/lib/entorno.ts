import "server-only";
import { z } from "zod";

/** Variables de entorno validadas al primer uso: si falta algo, falla con un mensaje claro. */
const esquema = z.object({
  DATABASE_URL: z.string().min(1, "Falta DATABASE_URL"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

let cache: z.infer<typeof esquema> | undefined;

export function entorno() {
  if (!cache) {
    const resultado = esquema.safeParse(process.env);
    if (!resultado.success) {
      const detalle = resultado.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Variables de entorno inválidas: ${detalle}`);
    }
    cache = resultado.data;
  }
  return cache;
}
