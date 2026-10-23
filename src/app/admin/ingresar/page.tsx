import type { Metadata } from "next";
import { FormularioIngreso } from "./formulario";

export const metadata: Metadata = { title: "Ingresar al panel", robots: { index: false } };

export default function PaginaIngreso() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-bold">Ingresar al panel</h1>
      <p className="mt-1 text-muted">Pedidos y menú de tu local.</p>
      <FormularioIngreso />
    </main>
  );
}
