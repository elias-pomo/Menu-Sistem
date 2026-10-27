import { manejar } from "@/lib/http";
import { listarHistorial } from "@/modulos/auditoria";
import { requerirRol } from "@/modulos/autenticacion";

/** Historial administrativo (RF-036). Solo el dueño, solo lectura, paginado con `cursor`. */
export async function GET(request: Request) {
  return manejar(async () => {
    const sesion = await requerirRol("OWNER");
    const cursor = new URL(request.url).searchParams.get("cursor");
    return Response.json(await listarHistorial(sesion, cursor), { headers: { "Cache-Control": "no-store" } });
  });
}
