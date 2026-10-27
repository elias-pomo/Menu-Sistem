import { manejar, verificarOrigen } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { registrarWhatsapp } from "@/modulos/pedidos";

/** Registra que se abrió WhatsApp con el mensaje del pedido (no que se envió). */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/admin/orders/[id]/whatsapp">) {
  return manejar(async () => {
    verificarOrigen(request);
    return Response.json(await registrarWhatsapp(await requerirRol("STAFF"), (await params).id));
  });
}
