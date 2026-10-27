import type { Metadata } from "next";
import { Suspense } from "react";
import { AjustesNegocio } from "@/componentes/panel/ajustes-negocio";
import { obtenerAjustes } from "@/modulos/ajustes";
import { sesionDePagina } from "@/modulos/autenticacion";

export const metadata: Metadata = { title: "Ajustes" };

/** Datos del local, horarios, envío y pagos (RF-034, RF-035). */
export default function PaginaAjustes() {
  return (
    <Suspense fallback={<p className="text-muted">Cargando…</p>}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const ajustes = await obtenerAjustes(await sesionDePagina());
  return <AjustesNegocio ajustes={ajustes} />;
}
