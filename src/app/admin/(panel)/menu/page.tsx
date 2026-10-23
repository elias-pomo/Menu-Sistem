import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminMenu } from "@/componentes/panel/admin-menu";
import { sesionDePagina, tieneRolMinimo } from "@/modulos/autenticacion";
import { listarMenuAdmin } from "@/modulos/menu";

export const metadata: Metadata = { title: "Menú" };

export default function PaginaMenu() {
  return (
    <Suspense fallback={<p className="text-muted">Cargando el menú…</p>}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const sesion = await sesionDePagina();
  const { categorias, grupos } = await listarMenuAdmin(sesion);
  return (
    <AdminMenu
      puedeEditar={tieneRolMinimo(sesion.role, "MANAGER")}
      grupos={grupos.map((g) => ({ id: g.id, name: g.name }))}
      categorias={categorias.map((c) => ({
        id: c.id,
        name: c.name,
        isActive: c.isActive,
        products: c.products.map((p) => ({
          id: p.id,
          name: p.name,
          priceCents: p.priceCents,
          isActive: p.isActive,
          isSoldOut: p.isSoldOut,
          imageUrl: p.imageUrl,
          grupos: p.optionGroups.length,
        })),
      }))}
    />
  );
}
