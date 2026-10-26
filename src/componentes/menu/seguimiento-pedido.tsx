"use client";

import { Check, Clock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatearPesos } from "@/lib/dinero";
import { ETIQUETA_ESTADO, type EstadoPedido } from "@/modulos/pedidos/estados";
import type { Seguimiento } from "@/modulos/pedidos";
import { estiloNegocio } from "./menu-negocio";

const INTERVALO_MS = 15_000;
const TERMINALES = ["DELIVERED", "CANCELLED"];

/** Pasos que ve el cliente, según el tipo de entrega. */
function pasos(fulfillment: "PICKUP" | "DELIVERY"): EstadoPedido[] {
  return fulfillment === "DELIVERY"
    ? ["PENDING", "CONFIRMED", "PREPARING", "READY", "ON_THE_WAY", "DELIVERED"]
    : ["PENDING", "CONFIRMED", "PREPARING", "READY", "DELIVERED"];
}

/** Confirmación y seguimiento del pedido (RF-016, RF-017). Se refresca cada 15 s con la pestaña visible. */
export function SeguimientoPedido({ slug, token, inicial, color }: { slug: string; token: string; inicial: Seguimiento; color: string }) {
  const [pedido, setPedido] = useState(inicial);

  useEffect(() => {
    if (TERMINALES.includes(pedido.status)) return;
    let cancelado = false;
    async function actualizar() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/v1/public/${slug}/orders/${token}`, { cache: "no-store" });
        if (r.ok && !cancelado) setPedido((await r.json()).order);
      } catch {
        // Sin conexión: se reintenta en el próximo ciclo.
      }
    }
    const intervalo = window.setInterval(actualizar, INTERVALO_MS);
    document.addEventListener("visibilitychange", actualizar);
    return () => {
      cancelado = true;
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", actualizar);
    };
  }, [slug, token, pedido.status]);

  const cancelado = pedido.status === "CANCELLED";
  const lista = pasos(pedido.fulfillment);
  const actual = lista.indexOf(pedido.status);

  return (
    <main style={estiloNegocio(color)} className="mx-auto min-h-dvh max-w-2xl px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <p className="text-sm text-muted">{pedido.negocio.name}</p>
      <div className="mt-2 rounded-3xl bg-white p-5 text-center shadow-sm">
        <p className="text-sm text-muted">Tu pedido</p>
        <p className="mt-1 font-mono text-5xl font-bold tracking-widest" aria-label={`Código ${pedido.code.split("").join(" ")}`}>
          {pedido.code}
        </p>
        <p role="status" aria-live="polite" className={`mt-4 text-lg font-semibold ${cancelado ? "text-red-700" : ""}`}>
          {pedido.mensaje}
        </p>
        {pedido.status === "PENDING" && <p className="mt-1 text-sm text-muted">Te avisamos acá en cuanto lo confirmen. Dejá esta página abierta o guardá el link.</p>}
        {pedido.estimatedMinutes && pedido.confirmedAt && !TERMINALES.includes(pedido.status) && (
          <p className="mt-2 inline-flex items-center gap-1 text-sm text-muted">
            <Clock className="size-4" aria-hidden />
            Listo aprox. a las {horaEstimada(pedido.confirmedAt, pedido.estimatedMinutes)}
          </p>
        )}
      </div>

      {!cancelado && (
        <ol className="mt-5 flex flex-col gap-2" aria-label="Estado del pedido">
          {lista.map((estado, i) => {
            const hecho = i < actual || pedido.status === "DELIVERED";
            const enCurso = i === actual && pedido.status !== "DELIVERED";
            return (
              <li key={estado} className={`flex items-center gap-3 ${i > actual ? "text-stone-400" : ""}`} aria-current={enCurso ? "step" : undefined}>
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${hecho ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : enCurso ? "border-2 border-[var(--primary)]" : "border border-stone-300"}`}
                >
                  {hecho ? <Check className="size-4" aria-hidden /> : i + 1}
                </span>
                <span className={enCurso ? "font-semibold" : ""}>{ETIQUETA_ESTADO[estado]}</span>
              </li>
            );
          })}
        </ol>
      )}

      {pedido.negocio.transferencia?.alias && !cancelado && (
        <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Transferí {formatearPesos(pedido.totalCents)} al alias:</p>
          <p className="mt-1 select-all font-mono text-lg">{pedido.negocio.transferencia.alias}</p>
          {pedido.negocio.transferencia.titular && <p>A nombre de {pedido.negocio.transferencia.titular}</p>}
        </div>
      )}

      <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">{pedido.fulfillment === "DELIVERY" ? `Delivery${pedido.barrio ? ` a ${pedido.barrio}` : ""}` : "Retiro en el local"}</h2>
        {pedido.fulfillment === "PICKUP" && pedido.negocio.address && <p className="text-sm text-muted">{pedido.negocio.address}</p>}
        <ul className="mt-3 divide-y divide-stone-100 text-sm">
          {pedido.items.map((item, i) => (
            <li key={i} className="flex gap-3 py-2">
              <span className="tabular-nums">{item.quantity}×</span>
              <span className="flex-1">
                {item.name}
                {item.detalle && <span className="block text-muted">{item.detalle}</span>}
                {item.note && <span className="block italic text-muted">“{item.note}”</span>}
              </span>
              <span className="tabular-nums">{formatearPesos(item.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1 border-t border-stone-100 pt-2 text-sm">
          {pedido.deliveryFeeCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Envío</dt>
              <dd className="tabular-nums">{formatearPesos(pedido.deliveryFeeCents)}</dd>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatearPesos(pedido.totalCents)}</dd>
          </div>
          <div className="flex justify-between text-muted">
            <dt>Pago</dt>
            <dd>{pedido.paymentMethod === "CASH" ? "Efectivo" : "Transferencia"}</dd>
          </div>
        </dl>
      </section>

      <Link href={`/${slug}`} className="mt-6 grid h-12 place-items-center rounded-full border border-stone-300 font-medium">
        Volver al menú
      </Link>
    </main>
  );
}

function horaEstimada(confirmado: string, minutos: number) {
  return new Date(new Date(confirmado).getTime() + minutos * 60_000).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
