import { z } from "zod";
import { ROLES } from "@/modulos/autenticacion/permisos";

/** Validación de la gestión de usuarios del local (RF-037). Archivo puro. */

const rol = z.enum(ROLES, { error: "Elegí un rol." });
const nombre = z.string().trim().min(2, "Falta el nombre.").max(80, "Nombre: hasta 80 caracteres.");

export const UsuarioNuevo = z
  .object({
    name: nombre,
    email: z.string().trim().max(254).pipe(z.email("Ingresá un email válido.")),
    role: rol,
  })
  .strict();
export type UsuarioNuevoDatos = z.infer<typeof UsuarioNuevo>;

export const UsuarioCambios = z
  .object({ name: nombre.optional(), role: rol.optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "No hay cambios.");
export type UsuarioCambiosDatos = z.infer<typeof UsuarioCambios>;

export const CambioContrasena = z
  .object({ actual: z.string().min(1, "Ingresá tu contraseña actual.").max(200), nueva: z.string().max(200) })
  .strict();
