import { leerCuerpo, manejar } from "@/lib/http";
import { cambiarContrasena, requerirRol } from "@/modulos/autenticacion";
import { CambioContrasena } from "@/modulos/usuarios";

/** Cambiar la propia contraseña. Pide la actual; cierra las demás sesiones, no esta. */
export async function POST(request: Request) {
  return manejar(async () => {
    const sesion = await requerirRol("STAFF");
    const { actual, nueva } = await leerCuerpo(request, CambioContrasena);
    await cambiarContrasena({ userId: sesion.userId, sessionHash: sesion.sessionHash, actual, nueva });
    return Response.json({ ok: true });
  });
}
