import { leerCuerpo, manejar, verificarOrigen } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { archivarGrupo, editarGrupo, Grupo } from "@/modulos/menu";

/** Reemplaza el grupo con sus opciones: las que no vienen se archivan. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/v1/admin/option-groups/[id]">) {
  return manejar(async () => {
    const sesion = await requerirRol("MANAGER");
    const grupo = await editarGrupo(sesion, (await params).id, await leerCuerpo(request, Grupo));
    return Response.json({ group: grupo });
  });
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/v1/admin/option-groups/[id]">) {
  return manejar(async () => {
    verificarOrigen(request);
    await archivarGrupo(await requerirRol("MANAGER"), (await params).id);
    return Response.json({ ok: true });
  });
}
