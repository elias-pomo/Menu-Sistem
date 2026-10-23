import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Pedidos" };

/** Pantalla de pedidos: llega en la Fase 5. */
export default function PaginaPedidos() {
  return (
    <section>
      <h1 className="text-2xl font-bold">Pedidos</h1>
      <p className="mt-2 text-muted">La recepción de pedidos se habilita en la próxima etapa.</p>
      <Link href="/admin/menu" className="mt-4 inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-primary-foreground">
        Ir al menú
      </Link>
    </section>
  );
}
