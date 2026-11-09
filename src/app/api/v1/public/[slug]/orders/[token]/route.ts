import { connection } from "next/server";
import { noEncontrado } from "@/lib/errores";
import { ipDe, manejar } from "@/lib/http";
import { obtenerSeguimiento } from "@/modulos/pedidos";

/** Estado del pedido con el token de seguimiento (RF-017). 404 uniforme; 429 si una IP falla mucho. */
export async function GET(request: Request, { params }: RouteContext<"/api/v1/public/[slug]/orders/[token]">) {
  return manejar(async () => {
    await connection();
    const { slug, token } = await params;
    const seguimiento = await obtenerSeguimiento(slug, token, ipDe(request));
    if (!seguimiento) throw noEncontrado("No encontramos este pedido.");
    return Response.json({ order: seguimiento }, { headers: { "Cache-Control": "no-store" } });
  });
}
