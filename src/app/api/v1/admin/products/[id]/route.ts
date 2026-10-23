import { leerCuerpo, manejar, verificarOrigen } from "@/lib/http";
import { noEncontrado } from "@/lib/errores";
import { requerirRol } from "@/modulos/autenticacion";
import { archivarProducto, editarProducto, obtenerProductoAdmin, ProductoCambios } from "@/modulos/menu";

export async function GET(_request: Request, { params }: RouteContext<"/api/v1/admin/products/[id]">) {
  return manejar(async () => {
    const producto = await obtenerProductoAdmin(await requerirRol("STAFF"), (await params).id);
    if (!producto) throw noEncontrado("No encontramos este producto.");
    return Response.json({ product: producto });
  });
}

/** Edición con control de concurrencia: `expectedUpdatedAt` obligatorio. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/v1/admin/products/[id]">) {
  return manejar(async () => {
    const sesion = await requerirRol("MANAGER");
    const producto = await editarProducto(sesion, (await params).id, await leerCuerpo(request, ProductoCambios));
    return Response.json({ product: producto });
  });
}

/** Archiva el producto (los pedidos conservan su copia). */
export async function DELETE(request: Request, { params }: RouteContext<"/api/v1/admin/products/[id]">) {
  return manejar(async () => {
    verificarOrigen(request);
    await archivarProducto(await requerirRol("MANAGER"), (await params).id);
    return Response.json({ ok: true });
  });
}
