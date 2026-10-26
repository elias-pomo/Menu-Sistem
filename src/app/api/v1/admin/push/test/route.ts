import { AppError } from "@/lib/errores";
import { manejar, verificarOrigen } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { enviarAlUsuario, mensajePrueba, pushConfigurado } from "@/modulos/notificaciones";

/** Aviso de prueba a los navegadores del usuario de la sesión. Responde cuántos se enviaron. */
export async function POST(request: Request) {
  return manejar(async () => {
    verificarOrigen(request);
    const sesion = await requerirRol("STAFF");
    if (!pushConfigurado()) throw new AppError("SERVICE_UNAVAILABLE", "Los avisos no están configurados en el servidor.");
    return Response.json(await enviarAlUsuario(sesion, mensajePrueba()));
  });
}
