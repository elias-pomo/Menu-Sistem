import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MenuNegocio } from "@/componentes/menu/menu-negocio";
import { obtenerMenuPublico } from "@/modulos/menu";
import { CargandoMenu } from "./cargando";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const menu = await obtenerMenuPublico((await params).slug);
  if (!menu) return { title: "Negocio no encontrado" };
  return { title: menu.business.name, description: `Menú y pedidos de ${menu.business.name}.` };
}

export default function PaginaMenu({ params }: PageProps<"/[slug]">) {
  return (
    <Suspense fallback={<CargandoMenu />}>
      <Menu params={params} />
    </Suspense>
  );
}

async function Menu({ params }: { params: PageProps<"/[slug]">["params"] }) {
  const menu = await obtenerMenuPublico((await params).slug);
  if (!menu) notFound();
  return <MenuNegocio menu={menu} />;
}
