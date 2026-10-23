import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CarritoVista } from "@/componentes/menu/carrito-vista";
import { obtenerMenuPublico } from "@/modulos/menu";
import { CargandoMenu } from "../cargando";

export const metadata: Metadata = { title: "Tu pedido", robots: { index: false } };

export default function PaginaCarrito({ params }: PageProps<"/[slug]/carrito">) {
  return (
    <Suspense fallback={<CargandoMenu />}>
      <Carrito params={params} />
    </Suspense>
  );
}

async function Carrito({ params }: { params: PageProps<"/[slug]/carrito">["params"] }) {
  const menu = await obtenerMenuPublico((await params).slug);
  if (!menu) notFound();
  return <CarritoVista menu={menu} />;
}
