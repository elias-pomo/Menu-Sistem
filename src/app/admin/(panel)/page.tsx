import type { Metadata } from "next";
import { Suspense } from "react";
import { PanelPedidos } from "@/componentes/panel/panel-pedidos";
import { sesionDePagina } from "@/modulos/autenticacion";

export const metadata: Metadata = { title: "Pedidos" };

/** Pantalla de inicio del panel: los pedidos del día. */
export default function PaginaPedidos() {
  return (
    <Suspense fallback={<p className="text-muted">Cargando pedidos…</p>}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  await sesionDePagina();
  return <PanelPedidos />;
}
