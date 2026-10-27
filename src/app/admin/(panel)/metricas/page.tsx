import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MetricasPanel } from "@/componentes/panel/metricas-panel";
import { sesionDePagina, tieneRolMinimo } from "@/modulos/autenticacion";
import { obtenerMetricas, periodoDeAtajo } from "@/modulos/metricas";
import { fechaDeNegocio, obtenerNegocio } from "@/modulos/negocio";

export const metadata: Metadata = { title: "Métricas" };

/** Métricas del local (RF-038): encargado o dueño. Arranca con los últimos 7 días. */
export default function PaginaMetricas() {
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Métricas</h1>
      <Suspense fallback={<p className="text-muted">Calculando…</p>}>
        <Contenido />
      </Suspense>
    </section>
  );
}

async function Contenido() {
  const sesion = await sesionDePagina();
  if (!tieneRolMinimo(sesion.role, "MANAGER")) redirect("/admin");
  const negocio = await obtenerNegocio(sesion.businessId);
  const hoy = fechaDeNegocio(new Date(), negocio?.timezone ?? "America/Argentina/Buenos_Aires");
  const metricas = await obtenerMetricas(sesion, periodoDeAtajo("7dias", hoy));
  return <MetricasPanel inicial={metricas} />;
}
