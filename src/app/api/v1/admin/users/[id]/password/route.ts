import { manejar, verificarOrigen } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { restablecerContrasena } from "@/modulos/usuarios";

/** Contraseña temporal nueva para un usuario que se olvidó la suya. Cierra sus sesiones. */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/admin/users/[id]/password">) {
  return manejar(async () => {
    verificarOrigen(request);
    const sesion = await requerirRol("OWNER");
    const { contrasenaTemporal } = await restablecerContrasena(sesion, (await params).id);
    return Response.json({ temporaryPassword: contrasenaTemporal }, { headers: { "Cache-Control": "no-store" } });
  });
}
