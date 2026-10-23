import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { GruposOpciones } from "@/componentes/panel/grupos-opciones";
import { sesionDePagina, tieneRolMinimo } from "@/modulos/autenticacion";
import { listarGrupos } from "@/modulos/menu";

export const metadata: Metadata = { title: "Opciones" };

export default function PaginaOpciones() {
  return (
    <Suspense fallback={<p className="text-muted">Cargando…</p>}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const sesion = await sesionDePagina();
  if (!tieneRolMinimo(sesion.role, "MANAGER")) redirect("/admin/menu");
  const grupos = await listarGrupos(sesion);
  return (
    <GruposOpciones
      grupos={grupos.map((g) => ({
        id: g.id,
        name: g.name,
        kind: g.kind,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        productos: g._count.products,
        options: g.options.map((o) => ({ id: o.id, name: o.name, priceDeltaCents: o.priceDeltaCents, isAvailable: o.isAvailable })),
      }))}
    />
  );
}
