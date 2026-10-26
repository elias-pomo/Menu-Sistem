import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormularioPedido } from "@/componentes/menu/formulario-pedido";
import { obtenerMenuPublico } from "@/modulos/menu";
import { CargandoMenu } from "../cargando";

export const metadata: Metadata = { title: "Datos del pedido", robots: { index: false } };

export default function PaginaConfirmar({ params }: PageProps<"/[slug]/confirmar">) {
  return (
    <Suspense fallback={<CargandoMenu />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: PageProps<"/[slug]/confirmar">["params"] }) {
  const menu = await obtenerMenuPublico((await params).slug);
  if (!menu) notFound();
  return <FormularioPedido menu={menu} />;
}
