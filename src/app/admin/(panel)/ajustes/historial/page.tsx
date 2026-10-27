import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { HistorialPanel } from "@/componentes/panel/historial-panel";
import { listarHistorial } from "@/modulos/auditoria";
import { sesionDePagina, tieneRolMinimo } from "@/modulos/autenticacion";

export const metadata: Metadata = { title: "Historial" };

export default function PaginaHistorial() {
  return (
    <Suspense fallback={<p className="text-muted">Cargando…</p>}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const sesion = await sesionDePagina();
  if (!tieneRolMinimo(sesion.role, "OWNER")) redirect("/admin/ajustes");
  const { entries, nextCursor } = await listarHistorial(sesion, null);
  return <HistorialPanel inicial={entries} cursorInicial={nextCursor} />;
}
