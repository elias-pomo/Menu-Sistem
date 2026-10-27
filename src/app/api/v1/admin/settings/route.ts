import { leerCuerpo, manejar } from "@/lib/http";
import { CambiosAjustes, guardarAjustes, obtenerAjustes } from "@/modulos/ajustes";
import { requerirRol } from "@/modulos/autenticacion";

/** Configuración del negocio: la ve cualquier usuario del local. */
export async function GET() {
  return manejar(async () => Response.json({ settings: await obtenerAjustes(await requerirRol("STAFF")) }));
}

/** Datos y horarios: encargado o más. Envío y pagos: solo el dueño (el servicio lo verifica por sección). */
export async function PATCH(request: Request) {
  return manejar(async () => {
    const sesion = await requerirRol("MANAGER");
    return Response.json({ settings: await guardarAjustes(sesion, await leerCuerpo(request, CambiosAjustes)) });
  });
}
