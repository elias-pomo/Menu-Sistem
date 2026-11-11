import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SeguimientoPedido } from "@/componentes/menu/seguimiento-pedido";
import { AppError } from "@/lib/errores";
import { ipDeCabeceras } from "@/lib/http";
import { obtenerMenuPublico } from "@/modulos/menu";
import { obtenerSeguimiento } from "@/modulos/pedidos";
import { CargandoMenu } from "../../cargando";

// El link de seguimiento es privado: no se indexa ni manda el token a otros sitios.
export const metadata: Metadata = { title: "Tu pedido", robots: { index: false }, referrer: "no-referrer" };

export default function PaginaSeguimiento({ params }: PageProps<"/[slug]/pedido/[token]">) {
  return (
    <Suspense fallback={<CargandoMenu />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: PageProps<"/[slug]/pedido/[token]">["params"] }) {
  await connection();
  const { slug, token } = await params;
  const ip = ipDeCabeceras(await headers());
  // Pasado el límite de fallos por IP, la página muestra lo mismo que con un token inexistente.
  const buscar = obtenerSeguimiento(slug, token, ip).catch((e) => (e instanceof AppError && e.code === "RATE_LIMITED" ? null : Promise.reject(e)));
  const [pedido, menu] = await Promise.all([buscar, obtenerMenuPublico(slug)]);
  if (!pedido || !menu) notFound();
  return <SeguimientoPedido slug={slug} token={token} inicial={pedido} color={menu.business.primaryColor} estilo={menu.business.menuStyle} />;
}
