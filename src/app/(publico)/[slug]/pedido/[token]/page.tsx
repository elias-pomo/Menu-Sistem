import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SeguimientoPedido } from "@/componentes/menu/seguimiento-pedido";
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
  const [pedido, menu] = await Promise.all([obtenerSeguimiento(slug, token), obtenerMenuPublico(slug)]);
  if (!pedido || !menu) notFound();
  return <SeguimientoPedido slug={slug} token={token} inicial={pedido} color={menu.business.primaryColor} />;
}
