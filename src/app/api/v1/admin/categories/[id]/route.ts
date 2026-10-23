import { leerCuerpo, manejar, verificarOrigen } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { archivarCategoria, CategoriaCambios, editarCategoria } from "@/modulos/menu";

export async function PATCH(request: Request, { params }: RouteContext<"/api/v1/admin/categories/[id]">) {
  return manejar(async () => {
    const sesion = await requerirRol("MANAGER");
    const categoria = await editarCategoria(sesion, (await params).id, await leerCuerpo(request, CategoriaCambios));
    return Response.json({ category: categoria });
  });
}

/** Archiva la categoría y sus productos. */
export async function DELETE(request: Request, { params }: RouteContext<"/api/v1/admin/categories/[id]">) {
  return manejar(async () => {
    verificarOrigen(request);
    await archivarCategoria(await requerirRol("MANAGER"), (await params).id);
    return Response.json({ ok: true });
  });
}
