import { leerCuerpo, manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { Cobro, marcarCobrado } from "@/modulos/pedidos";

/** Marcar o quitar la marca de cobrado (RF-028). */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/admin/orders/[id]/paid">) {
  return manejar(async () => {
    const sesion = await requerirRol("STAFF");
    const { paid } = await leerCuerpo(request, Cobro);
    return Response.json({ order: await marcarCobrado(sesion, (await params).id, paid) });
  });
}
