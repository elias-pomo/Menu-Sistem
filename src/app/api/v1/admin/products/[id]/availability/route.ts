import { leerCuerpo, manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { cambiarDisponibilidad, Disponibilidad } from "@/modulos/menu";

/** Visible o agotado, un campo por llamada. Lo puede usar el personal. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/v1/admin/products/[id]/availability">) {
  return manejar(async () => {
    const sesion = await requerirRol("STAFF");
    const producto = await cambiarDisponibilidad(sesion, (await params).id, await leerCuerpo(request, Disponibilidad));
    return Response.json({ product: producto });
  });
}
