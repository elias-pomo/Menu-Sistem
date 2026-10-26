import { leerCuerpo, manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { Cancelacion, cambiarEstado, obtenerPedidoPanel } from "@/modulos/pedidos";

/** Cancelar o rechazar un pedido, con motivo obligatorio (RF-019). */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/admin/orders/[id]/cancel">) {
  return manejar(async () => {
    const sesion = await requerirRol("STAFF");
    const { id } = await params;
    const { expectedStatus, reason, note } = await leerCuerpo(request, Cancelacion);
    await cambiarEstado(sesion, id, { toStatus: "CANCELLED", expectedStatus, cancelReason: reason, reason: note });
    return Response.json({ order: await obtenerPedidoPanel(sesion, id) });
  });
}
