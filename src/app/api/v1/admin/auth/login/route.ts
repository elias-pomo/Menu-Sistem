import { z } from "zod";
import { ipDe, leerCuerpo, manejar } from "@/lib/http";
import { guardarCookieSesion, iniciarSesion } from "@/modulos/autenticacion";

const Login = z.object({
  email: z.string().trim().min(3, "Ingresá tu email.").max(254),
  password: z.string().min(1, "Ingresá tu contraseña.").max(200),
});

/** Iniciar sesión en el panel. Mensaje genérico ante cualquier error de credenciales. */
export async function POST(request: Request) {
  return manejar(async () => {
    const { email, password } = await leerCuerpo(request, Login);
    const { token } = await iniciarSesion({ email, password, ip: ipDe(request), userAgent: request.headers.get("user-agent") });
    await guardarCookieSesion(token);
    return Response.json({ ok: true });
  });
}
