import { manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { obtenerPedidoPanel } from "@/modulos/pedidos";

/** Detalle completo de un pedido, con su historial de estados. */
export async function GET(_request: Request, { params }: RouteContext<"/api/v1/admin/orders/[id]">) {
  return manejar(async () => {
    const pedido = await obtenerPedidoPanel(await requerirRol("STAFF"), (await params).id);
    return Response.json({ order: pedido }, { headers: { "Cache-Control": "no-store" } });
  });
}
