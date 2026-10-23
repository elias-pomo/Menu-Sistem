import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormularioProducto } from "@/componentes/panel/formulario-producto";
import { sesionDePagina, tieneRolMinimo } from "@/modulos/autenticacion";
import { opcionesDelFormulario } from "../datos";

export const metadata: Metadata = { title: "Nuevo producto" };

export default function PaginaNuevoProducto() {
  return (
    <Suspense fallback={<p className="text-muted">Cargando…</p>}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const sesion = await sesionDePagina();
  if (!tieneRolMinimo(sesion.role, "MANAGER")) redirect("/admin/menu");
  const { categorias, grupos } = await opcionesDelFormulario(sesion);
  if (categorias.length === 0) redirect("/admin/menu");
  return <FormularioProducto producto={null} categorias={categorias} grupos={grupos} />;
}
