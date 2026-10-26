import { AppError } from "@/lib/errores";
import { manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { listarPedidosPanel } from "@/modulos/pedidos";

/**
 * Pedidos del panel. Sin `since`: activos y terminados del día. Con `since` (el cursor de la
 * respuesta anterior): solo los que cambiaron. Es la consulta del polling (ADR-005).
 */
export async function GET(request: Request) {
  return manejar(async () => {
    const sesion = await requerirRol("STAFF");
    const since = new URL(request.url).searchParams.get("since");
    const desde = since ? new Date(since) : null;
    if (desde && Number.isNaN(desde.getTime())) throw new AppError("VALIDATION_ERROR", "Cursor inválido.", { fields: { since: "Fecha inválida." } });
    return Response.json(await listarPedidosPanel(sesion, desde), { headers: { "Cache-Control": "no-store" } });
  });
}
