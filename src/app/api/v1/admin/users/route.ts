import { leerCuerpo, manejar } from "@/lib/http";
import { requerirRol } from "@/modulos/autenticacion";
import { crearUsuario, listarUsuarios, UsuarioNuevo } from "@/modulos/usuarios";

/** Usuarios del local (RF-037). Solo el dueño. */
export async function GET() {
  return manejar(async () => Response.json({ users: await listarUsuarios(await requerirRol("OWNER")) }));
}

/** Alta con contraseña temporal: la respuesta es el único lugar donde se ve. */
export async function POST(request: Request) {
  return manejar(async () => {
    const sesion = await requerirRol("OWNER");
    const { usuario, contrasenaTemporal } = await crearUsuario(sesion, await leerCuerpo(request, UsuarioNuevo));
    return Response.json({ user: usuario, temporaryPassword: contrasenaTemporal }, { status: 201, headers: { "Cache-Control": "no-store" } });
  });
}
