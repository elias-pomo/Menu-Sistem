import { after } from "next/server";
import { ipDe, leerCuerpo, manejar } from "@/lib/http";
import { avisarPedidoNuevo } from "@/modulos/notificaciones";
import { crearPedido, PedidoNuevo } from "@/modulos/pedidos";

/**
 * Crear un pedido (RF-008 a RF-015). 201 con código y token; si el mismo `clientRequestId` ya creó
 * un pedido, 200 con ese mismo pedido (doble toque o reintento). El aviso push al local sale
 * después de responder, para no demorar al cliente.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/public/[slug]/orders">) {
  return manejar(async () => {
    const datos = await leerCuerpo(request, PedidoNuevo);
    const { pedido, repetido, businessId } = await crearPedido({ slug: (await params).slug, datos, ip: ipDe(request) });
    if (!repetido) {
      after(() =>
        avisarPedidoNuevo(businessId, { code: pedido.code, fulfillment: datos.fulfillment, customerName: datos.customer.name, totalCents: pedido.totalCents }),
      );
    }
    return Response.json({ order: pedido }, { status: repetido ? 200 : 201 });
  });
}
