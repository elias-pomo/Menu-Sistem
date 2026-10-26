import { ipDe, leerCuerpo, manejar } from "@/lib/http";
import { crearPedido, PedidoNuevo } from "@/modulos/pedidos";

/**
 * Crear un pedido (RF-008 a RF-015). 201 con código y token; si el mismo `clientRequestId` ya creó
 * un pedido, 200 con ese mismo pedido (doble toque o reintento).
 */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/public/[slug]/orders">) {
  return manejar(async () => {
    const datos = await leerCuerpo(request, PedidoNuevo);
    const { pedido, repetido } = await crearPedido({ slug: (await params).slug, datos, ip: ipDe(request) });
    return Response.json({ order: pedido }, { status: repetido ? 200 : 201 });
  });
}
