import { randomUUID } from "node:crypto";
import { noEncontrado, respuestaError } from "@/lib/errores";
import { obtenerMenuPublico } from "@/modulos/menu";

/** Menú público de un negocio: datos, horarios, categorías, productos, grupos y opciones activos. */
export async function GET(_request: Request, { params }: RouteContext<"/api/v1/public/[slug]/menu">) {
  const { slug } = await params;
  const menu = await obtenerMenuPublico(slug);
  if (!menu) return respuestaError(noEncontrado("No encontramos este negocio."), `req_${randomUUID()}`);
  return Response.json(menu, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } });
}
