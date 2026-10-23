import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { FormularioProducto } from "@/componentes/panel/formulario-producto";
import { sesionDePagina, tieneRolMinimo } from "@/modulos/autenticacion";
import { obtenerProductoAdmin } from "@/modulos/menu";
import { opcionesDelFormulario } from "../datos";

export const metadata: Metadata = { title: "Editar producto" };

export default function PaginaEditarProducto({ params }: PageProps<"/admin/menu/productos/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Cargando…</p>}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: PageProps<"/admin/menu/productos/[id]">["params"] }) {
  const sesion = await sesionDePagina();
  if (!tieneRolMinimo(sesion.role, "MANAGER")) redirect("/admin/menu");
  const [producto, { categorias, grupos }] = await Promise.all([obtenerProductoAdmin(sesion, (await params).id), opcionesDelFormulario(sesion)]);
  if (!producto) notFound();
  return (
    <FormularioProducto
      producto={{
        id: producto.id,
        categoryId: producto.categoryId,
        name: producto.name,
        description: producto.description,
        priceCents: producto.priceCents,
        imageUrl: producto.imageUrl,
        tags: producto.tags,
        groupIds: producto.optionGroups.map((g) => g.groupId),
        updatedAt: producto.updatedAt.toISOString(),
      }}
      categorias={categorias}
      grupos={grupos}
    />
  );
}
