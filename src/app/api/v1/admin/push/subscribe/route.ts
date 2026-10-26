import { leerCuerpo, manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { Baja, desuscribir, suscribir, Suscripcion } from "@/modulos/notificaciones";

/** Alta del navegador para los avisos push del panel (una suscripción por navegador). */
export async function POST(request: Request) {
  return manejar(async () => {
    const sesion = await requerirRol("STAFF");
    await suscribir(sesion, await leerCuerpo(request, Suscripcion));
    return Response.json({ ok: true }, { status: 201 });
  });
}

/** Baja del navegador: al desactivar los avisos o al salir del panel. */
export async function DELETE(request: Request) {
  return manejar(async () => {
    const sesion = await requerirRol("STAFF");
    const { endpoint } = await leerCuerpo(request, Baja);
    await desuscribir(sesion, endpoint);
    return Response.json({ ok: true });
  });
}
