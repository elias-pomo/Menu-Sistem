import { leerCuerpo, manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { Orden, reordenarCategorias } from "@/modulos/menu";

export async function POST(request: Request) {
  return manejar(async () => {
    const sesion = await requerirRol("MANAGER");
    await reordenarCategorias(sesion, (await leerCuerpo(request, Orden)).ids);
    return Response.json({ ok: true });
  });
}
