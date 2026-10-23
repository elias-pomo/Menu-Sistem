import { leerCuerpo, manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { crearGrupo, Grupo, listarGrupos } from "@/modulos/menu";

export async function GET() {
  return manejar(async () => Response.json({ groups: await listarGrupos(await requerirRol("STAFF")) }));
}

export async function POST(request: Request) {
  return manejar(async () => {
    const sesion = await requerirRol("MANAGER");
    const grupo = await crearGrupo(sesion, await leerCuerpo(request, Grupo));
    return Response.json({ group: grupo }, { status: 201 });
  });
}
