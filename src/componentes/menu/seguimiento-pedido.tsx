"use client";

import { Check, Clock, Copy, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatearPesos } from "@/lib/dinero";
import type { EstiloMenu } from "@/modulos/menu/estilos";
import { ETIQUETA_ESTADO, type EstadoPedido } from "@/modulos/pedidos/estados";
import type { Seguimiento } from "@/modulos/pedidos";
import { MarcoMenu } from "./marco";

const INTERVALO_MS = 15_000;
const TERMINALES = ["DELIVERED", "CANCELLED"];

/** Pasos que ve el cliente, según el tipo de entrega. */
function pasos(fulfillment: "PICKUP" | "DELIVERY"): EstadoPedido[] {
  return fulfillment === "DELIVERY"
    ? ["PENDING", "CONFIRMED", "PREPARING", "READY", "ON_THE_WAY", "DELIVERED"]
    : ["PENDING", "CONFIRMED", "PREPARING", "READY", "DELIVERED"];
}

/** Confirmación y seguimiento del pedido (RF-016, RF-017). Se refresca cada 15 s con la pestaña visible. */
export function SeguimientoPedido({ slug, token, inicial, color, estilo }: { slug: string; token: string; inicial: Seguimiento; color: string; estilo: EstiloMenu }) {
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
  const entregado = pedido.status === "DELIVERED";
  const lista = pasos(pedido.fulfillment);
  const actual = lista.indexOf(pedido.status);
  const whatsapp = pedido.negocio.whatsappE164?.replace(/\D/g, "");

  return (
    <MarcoMenu estilo={estilo} color={color}>
      <main className="mx-auto max-w-xl px-5 pb-12 pt-[max(2rem,env(safe-area-inset-top))]">
        <p className="titulo text-center text-[1.35rem] text-tinta-suave nocturno:text-[1.6rem] mantel:italic">{pedido.negocio.name}</p>

        <section className="mt-5 rounded-[1.75rem] border border-linea bg-superficie px-6 pb-7 pt-6 text-center mantel:rounded-xl">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-tinta-suave">Tu pedido</p>
          <p
            className="titulo mt-2 text-[4rem] tabular-nums tracking-[0.12em] nocturno:text-[4.75rem] mantel:not-italic"
            aria-label={`Código ${pedido.code.split("").join(" ")}`}
          >
            {pedido.code}
          </p>
          <p
            key={pedido.status}
            role="status"
            aria-live="polite"
            className={`mx-auto mt-4 max-w-sm text-[18px] font-semibold leading-snug motion-safe:animate-[entrar-suave_420ms_var(--ease-salida)] ${cancelado ? "text-red-700 nocturno:text-red-400" : ""}`}
          >
            {pedido.mensaje}
          </p>
          {pedido.status === "PENDING" && <p className="mx-auto mt-2 max-w-sm text-[15px] text-tinta-suave">Te avisamos acá en cuanto lo confirmen. Dejá esta página abierta o guardá el link.</p>}
          {pedido.estimatedMinutes && pedido.confirmedAt && !TERMINALES.includes(pedido.status) && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-realce px-3.5 py-1.5 text-[14px] font-medium">
              <Clock className="size-4" aria-hidden />
              Listo aprox. a las {horaEstimada(pedido.confirmedAt, pedido.estimatedMinutes)}
            </p>
          )}
        </section>

        {!cancelado && (
          <ol className="relative mt-7 flex flex-col gap-5 pl-1" aria-label="Estado del pedido">
            {/* Riel de fondo y relleno que avanza con el estado (escala, no alto: no recalcula el layout). */}
            <span aria-hidden className="absolute bottom-3.5 left-[1.125rem] top-3.5 w-0.5 rounded-full bg-linea" />
            <span
              aria-hidden
              style={{ transform: `scaleY(${entregado ? 1 : Math.max(0, actual) / (lista.length - 1)})` }}
              className="absolute bottom-3.5 left-[1.125rem] top-3.5 w-0.5 origin-top rounded-full bg-acento transition-transform duration-700 ease-salida"
            />
            {lista.map((estado, i) => {
              const hecho = i < actual || entregado;
              const enCurso = i === actual && !entregado;
              return (
                <li key={estado} className="relative flex items-center gap-4" aria-current={enCurso ? "step" : undefined}>
                  <span
                    className={`relative grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold transition-colors duration-300 ${
                      hecho
                        ? "bg-acento text-sobre-acento"
                        : enCurso
                          ? "border-2 border-acento bg-superficie text-tinta motion-safe:animate-[anillo_2s_ease-out_infinite]"
                          : "border border-linea bg-lienzo text-tinta-suave"
                    }`}
                  >
                    {hecho ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
                  </span>
                  <span className={`text-[16px] ${enCurso ? "font-semibold text-tinta" : hecho ? "text-tinta" : "text-tinta-suave"}`}>{ETIQUETA_ESTADO[estado]}</span>
                </li>
              );
            })}
          </ol>
        )}

        {pedido.negocio.transferencia?.alias && !cancelado && (
          <Alias alias={pedido.negocio.transferencia.alias} titular={pedido.negocio.transferencia.titular} total={pedido.totalCents} />
        )}

        <section className="mt-7 rounded-tarjeta border border-linea bg-superficie p-5">
          <h2 className="titulo text-[1.35rem] nocturno:text-[1.6rem] mantel:italic">
            {pedido.fulfillment === "DELIVERY" ? `Delivery${pedido.barrio ? ` a ${pedido.barrio}` : ""}` : "Retiro en el local"}
          </h2>
          {pedido.fulfillment === "PICKUP" && pedido.negocio.address && <p className="mt-1 text-[15px] text-tinta-suave">{pedido.negocio.address}</p>}
          <ul className="mt-4 text-[15px]">
            {pedido.items.map((item, i) => (
              <li key={i} className={`flex gap-3 py-2.5 ${i ? "border-t border-linea" : ""}`}>
                <span className="w-6 tabular-nums text-tinta-suave">{item.quantity}×</span>
                <span className="flex-1">
                  {item.name}
                  {item.detalle && <span className="block text-[14px] text-tinta-suave">{item.detalle}</span>}
                  {item.note && <span className="block text-[14px] italic text-tinta-suave">“{item.note}”</span>}
                </span>
                <span className="tabular-nums">{formatearPesos(item.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-2 space-y-1.5 border-t border-linea pt-3 text-[15px]">
            {pedido.deliveryFeeCents > 0 && (
              <div className="flex justify-between">
                <dt className="text-tinta-suave">Envío</dt>
                <dd className="tabular-nums">{formatearPesos(pedido.deliveryFeeCents)}</dd>
              </div>
            )}
            <div className="flex justify-between text-[17px] font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatearPesos(pedido.totalCents)}</dd>
            </div>
            <div className="flex justify-between text-tinta-suave">
              <dt>Pago</dt>
              <dd>{pedido.paymentMethod === "CASH" ? "Efectivo" : "Transferencia"}</dd>
            </div>
          </dl>
        </section>

        <div className="mt-6 flex flex-col gap-2.5">
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, les escribo por mi pedido ${pedido.code}.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="presionable flex h-12 items-center justify-center gap-2 rounded-full border border-linea bg-superficie font-medium mantel:rounded-tarjeta"
            >
              <MessageCircle className="size-[1.1rem]" aria-hidden />
              Escribirle al local
            </a>
          )}
          <Link href={`/${slug}`} className="presionable grid h-12 place-items-center rounded-full font-medium text-tinta-suave hover:text-tinta mantel:rounded-tarjeta">
            Volver al menú
          </Link>
        </div>
      </main>
    </MarcoMenu>
  );
}

/** Alias para transferir, con botón para copiarlo (el texto también se puede seleccionar). */
function Alias({ alias, titular, total }: { alias: string; titular: string | null; total: number }) {
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(alias);
      setCopiado(true);
      window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Sin permiso de portapapeles: el alias queda seleccionable a mano.
    }
  }

  return (
    <section className="mt-7 rounded-tarjeta border border-linea bg-superficie p-5">
      <p className="text-[15px] text-tinta-suave">
        Transferí <span className="font-semibold tabular-nums text-tinta">{formatearPesos(total)}</span> al alias
      </p>
      <div className="mt-3 flex items-center gap-3 rounded-[calc(var(--m-radio)-0.25rem)] bg-realce py-2 pl-4 pr-2">
        <p className="min-w-0 flex-1 select-all truncate font-mono text-[17px]">{alias}</p>
        <button type="button" onClick={copiar} aria-label={copiado ? "Alias copiado" : "Copiar alias"} className="presionable relative h-10 w-28 shrink-0 overflow-hidden rounded-full bg-tinta text-[14px] font-semibold text-lienzo">
          <span aria-hidden className={`absolute inset-0 flex items-center justify-center gap-1.5 transition-[transform,opacity,filter] duration-200 ease-salida ${copiado ? "-translate-y-3 opacity-0 blur-[2px]" : ""}`}>
            <Copy className="size-4" aria-hidden />
            Copiar
          </span>
          <span aria-hidden className={`absolute inset-0 flex items-center justify-center gap-1.5 transition-[transform,opacity,filter] duration-200 ease-salida ${copiado ? "" : "translate-y-3 opacity-0 blur-[2px]"}`}>
            <Check className="size-4" strokeWidth={3} aria-hidden />
            Copiado
          </span>
        </button>
      </div>
      {titular && <p className="mt-2.5 text-[14px] text-tinta-suave">A nombre de {titular}</p>}
    </section>
  );
}

function horaEstimada(confirmado: string, minutos: number) {
  return new Date(new Date(confirmado).getTime() + minutos * 60_000).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
