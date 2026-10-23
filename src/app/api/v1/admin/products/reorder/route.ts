import { z } from "zod";
import { leerCuerpo, manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { Orden, reordenarProductos } from "@/modulos/menu";

const OrdenProductos = Orden.extend({ categoryId: z.uuid() });

export async function POST(request: Request) {
  return manejar(async () => {
    const sesion = await requerirRol("MANAGER");
    const { categoryId, ids } = await leerCuerpo(request, OrdenProductos);
    await reordenarProductos(sesion, categoryId, ids);
    return Response.json({ ok: true });
  });
}
