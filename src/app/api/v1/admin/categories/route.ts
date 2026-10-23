import { leerCuerpo, manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { CategoriaNueva, crearCategoria, listarMenuAdmin } from "@/modulos/menu";

/** Menú completo del panel: categorías con sus productos, y grupos de opciones. */
export async function GET() {
  return manejar(async () => Response.json(await listarMenuAdmin(await requerirRol("STAFF"))));
}

export async function POST(request: Request) {
  return manejar(async () => {
    const sesion = await requerirRol("MANAGER");
    const categoria = await crearCategoria(sesion, await leerCuerpo(request, CategoriaNueva));
    return Response.json({ category: categoria }, { status: 201 });
  });
}
