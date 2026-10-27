import { leerCuerpo, manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { cambiarUsuario, UsuarioCambios } from "@/modulos/usuarios";

/** Cambiar nombre o rol, desactivar o reactivar (RN-20: siempre queda un dueño activo). */
export async function PATCH(request: Request, { params }: RouteContext<"/api/v1/admin/users/[id]">) {
  return manejar(async () => {
    const sesion = await requerirRol("OWNER");
    return Response.json({ user: await cambiarUsuario(sesion, (await params).id, await leerCuerpo(request, UsuarioCambios)) });
  });
}
