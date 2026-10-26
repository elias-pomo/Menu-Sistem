import { leerCuerpo, manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { cambiarEstado, obtenerPedidoPanel, Transicion } from "@/modulos/pedidos";

/** Cambiar el estado de un pedido. 409 si otro usuario ya lo cambió; 422 si la transición no existe. */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/admin/orders/[id]/transition">) {
  return manejar(async () => {
    const sesion = await requerirRol("STAFF");
    const { id } = await params;
    const cambio = await leerCuerpo(request, Transicion);
    await cambiarEstado(sesion, id, cambio);
    return Response.json({ order: await obtenerPedidoPanel(sesion, id) });
  });
}
