import { leerCuerpo, manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { crearProducto, Producto } from "@/modulos/menu";

export async function POST(request: Request) {
  return manejar(async () => {
    const sesion = await requerirRol("MANAGER");
    const producto = await crearProducto(sesion, await leerCuerpo(request, Producto));
    return Response.json({ product: producto }, { status: 201 });
  });
}
