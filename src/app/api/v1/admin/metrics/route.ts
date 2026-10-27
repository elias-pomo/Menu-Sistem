import { manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { obtenerMetricas } from "@/modulos/metricas";

/** Métricas del local (RF-038): `from` y `to` en AAAA-MM-DD, incluidos, hasta 366 días. */
export async function GET(request: Request) {
  return manejar(async () => {
    const sesion = await requerirRol("MANAGER");
    const parametros = new URL(request.url).searchParams;
    const metricas = await obtenerMetricas(sesion, { desde: parametros.get("from"), hasta: parametros.get("to") });
    return Response.json(metricas, { headers: { "Cache-Control": "no-store" } });
  });
}
