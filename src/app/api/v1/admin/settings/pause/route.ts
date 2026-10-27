import { leerCuerpo, manejar } from "@/lib/http";
import { Pausa, pausarPedidos } from "@/modulos/ajustes";
import { requerirRol } from "@/modulos/autenticacion";

/** Pausar o reanudar los pedidos del menú. Lo puede hacer cualquier usuario del local. */
export async function POST(request: Request) {
  return manejar(async () => {
    const sesion = await requerirRol("STAFF");
    return Response.json(await pausarPedidos(sesion, await leerCuerpo(request, Pausa)));
  });
}
