import { NextResponse, type NextRequest } from "next/server";
import { NOMBRE_COOKIE } from "./modulos/autenticacion/cookie";

/**
 * Chequeo optimista del panel: sin cookie de sesión, al ingreso. La verificación real (sesión vigente,
 * usuario activo, rol) la hace `requerirRol` en cada página y ruta.
 */
export function proxy(request: NextRequest) {
  const tieneCookie = request.cookies.has(NOMBRE_COOKIE);
  const esIngreso = request.nextUrl.pathname === "/admin/ingresar";
  if (!tieneCookie && !esIngreso) return NextResponse.redirect(new URL("/admin/ingresar", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
