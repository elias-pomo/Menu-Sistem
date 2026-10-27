import { Suspense } from "react";
import { PestanasAjustes } from "@/componentes/panel/pestanas-ajustes";
import { sesionDePagina, tieneRolMinimo } from "@/modulos/autenticacion";

export default function LayoutAjustes({ children }: LayoutProps<"/admin/ajustes">) {
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Ajustes</h1>
      <Suspense fallback={<div className="mb-5 h-11" />}>
        <Pestanas />
      </Suspense>
      {children}
    </section>
  );
}

async function Pestanas() {
  const sesion = await sesionDePagina();
  return <PestanasAjustes esDueno={tieneRolMinimo(sesion.role, "OWNER")} />;
}
