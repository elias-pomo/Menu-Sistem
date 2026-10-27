import type { Metadata } from "next";
import { Suspense } from "react";
import { BarraPanel } from "@/componentes/panel/barra-panel";
import { sesionDePagina, tieneRolMinimo } from "@/modulos/autenticacion";
import { obtenerNegocio } from "@/modulos/negocio";

export const metadata: Metadata = { title: { default: "Panel", template: "%s · Panel" }, robots: { index: false } };

export default function LayoutPanel({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<div className="p-6 text-muted">Cargando…</div>}>
      <Marco>{children}</Marco>
    </Suspense>
  );
}

/** Marco del panel. La autorización real la hace cada página y cada ruta de la API. */
async function Marco({ children }: { children: React.ReactNode }) {
  const sesion = await sesionDePagina();
  const negocio = await obtenerNegocio(sesion.businessId);
  return (
    <div className="min-h-dvh pb-20 md:pb-0 md:pl-56">
      <BarraPanel negocio={negocio?.name ?? ""} slug={negocio?.slug ?? ""} usuario={sesion.name} esEncargado={tieneRolMinimo(sesion.role, "MANAGER")} />
      <div className="mx-auto max-w-3xl px-4 py-5">{children}</div>
    </div>
  );
}
