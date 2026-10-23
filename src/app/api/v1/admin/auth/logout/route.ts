import { manejar, verificarEscritura } from "@/lib/http";
import { borrarCookieSesion, cerrarSesion, leerTokenSesion } from "@/modulos/autenticacion";

/** Cerrar sesión: borra la sesión en la base y la cookie. */
export async function POST(request: Request) {
  return manejar(async () => {
    verificarEscritura(request);
    await cerrarSesion(await leerTokenSesion());
    await borrarCookieSesion();
    return Response.json({ ok: true });
  });
}
