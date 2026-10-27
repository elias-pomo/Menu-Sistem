"use client";

import { useState } from "react";
import { formatearPesos } from "@/lib/dinero";
import type { Metricas } from "@/modulos/metricas";
import { MAX_DIAS, periodoDeAtajo, problemaConPeriodo, type Atajo } from "@/modulos/metricas/periodo";
import { ETIQUETA_ESTADO, type EstadoPedido } from "@/modulos/pedidos/estados";
import { ErrorApi, llamarApi } from "./api";

/**
 * Métricas del local (RF-038). Muestra "ventas" e "importe", nunca "ganancia": el sistema no conoce
 * los costos (sección 7 del plan).
 */

const ATAJOS: { valor: Atajo; nombre: string }[] = [
  { valor: "hoy", nombre: "Hoy" },
  { valor: "ayer", nombre: "Ayer" },
  { valor: "7dias", nombre: "Últimos 7 días" },
  { valor: "mes", nombre: "Este mes" },
  { valor: "mesPasado", nombre: "Mes pasado" },
];

const CAMPO = "h-11 rounded-xl border border-stone-300 bg-white px-3";

function Tarjeta({ titulo, valor, detalle }: { titulo: string; valor: string | number; detalle?: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <dt className="text-sm text-muted">{titulo}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums">{valor}</dd>
      {detalle && <dd className="mt-0.5 text-xs text-muted">{detalle}</dd>}
    </div>
  );
}

function Ranking({ titulo, filas, vacio }: { titulo: string; filas: { nombre: string; cantidad: number }[]; vacio: string }) {
  const maximo = Math.max(1, ...filas.map((f) => f.cantidad));
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <h2 className="font-bold">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{vacio}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {filas.map((f) => (
            <li key={f.nombre} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="truncate">{f.nombre}</span>
                <span className="font-semibold tabular-nums">{f.cantidad}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(f.cantidad / maximo) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Horas({ horas }: { horas: Metricas["horas"] }) {
  const maximo = Math.max(1, ...horas.map((h) => h.cantidad));
  const conPedidos = horas.filter((h) => h.cantidad > 0);
  // Solo el tramo con actividad (más una hora a cada lado), para que las barras no queden finitas.
  const desde = conPedidos.length ? Math.max(0, conPedidos[0].hora - 1) : 0;
  const hasta = conPedidos.length ? Math.min(23, conPedidos.at(-1)!.hora + 1) : 23;
  const visibles = horas.slice(desde, hasta + 1);
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <h2 className="font-bold">Horas de mayor demanda</h2>
      {conPedidos.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Sin pedidos en el período.</p>
      ) : (
        <div role="img" aria-label={`Pedidos por hora: ${conPedidos.map((h) => `${h.hora} h, ${h.cantidad}`).join("; ")}`} className="mt-3 flex h-36 items-end gap-1">
          {visibles.map((h) => (
            <div key={h.hora} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-muted">{h.cantidad || ""}</span>
              <div className="w-full rounded-t bg-primary" style={{ height: `${(h.cantidad / maximo) * 96}px`, minHeight: h.cantidad ? 4 : 0 }} />
              <span className="text-[10px] tabular-nums text-muted">{h.hora}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function MetricasPanel({ inicial }: { inicial: Metricas }) {
  const [datos, setDatos] = useState(inicial);
  const [atajo, setAtajo] = useState<Atajo | "propio">("7dias");
  const [desde, setDesde] = useState(inicial.periodo.desde);
  const [hasta, setHasta] = useState(inicial.periodo.hasta);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function cargar(d: string, h: string) {
    const problema = problemaConPeriodo(d, h);
    if (problema) return setError(problema);
    setCargando(true);
    setError("");
    try {
      setDatos(await llamarApi<Metricas>("GET", `/api/v1/admin/metrics?from=${d}&to=${h}`));
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : "No se pudieron cargar las métricas.");
    } finally {
      setCargando(false);
    }
  }

  function elegirAtajo(valor: Atajo) {
    const p = periodoDeAtajo(valor, datos.hoy);
    setAtajo(valor);
    setDesde(p.desde);
    setHasta(p.hasta);
    cargar(p.desde, p.hasta);
  }

  const { pedidos, importes, entrega, tiempoPreparacion } = datos;
  return (
    <div className={`flex flex-col gap-5 ${cargando ? "opacity-60" : ""}`} aria-busy={cargando}>
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <div className="flex gap-2" role="group" aria-label="Período">
          {ATAJOS.map((a) => (
            <button
              key={a.valor}
              type="button"
              aria-pressed={atajo === a.valor}
              onClick={() => elegirAtajo(a.valor)}
              className={`h-11 shrink-0 rounded-full px-4 text-sm font-medium ${atajo === a.valor ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700"}`}
            >
              {a.nombre}
            </button>
          ))}
        </div>
      </div>
      <form
        method="post"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setAtajo("propio");
          cargar(desde, hasta);
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col text-sm">
          Desde
          <input type="date" value={desde} max={datos.hoy} onChange={(e) => setDesde(e.target.value)} className={`mt-1 ${CAMPO}`} />
        </label>
        <label className="flex flex-col text-sm">
          Hasta
          <input type="date" value={hasta} max={datos.hoy} onChange={(e) => setHasta(e.target.value)} className={`mt-1 ${CAMPO}`} />
        </label>
        <button type="submit" disabled={cargando} className="h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          Ver
        </button>
        <span className="w-full text-xs text-muted">Hasta {MAX_DIAS} días. Cada pedido cuenta el día en que se hizo, con su estado actual.</span>
      </form>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta titulo="Pedidos recibidos" valor={pedidos.recibidos} detalle={pedidos.activos ? `${pedidos.activos} todavía activos` : undefined} />
        <Tarjeta titulo="Entregados" valor={pedidos.entregados} />
        <Tarjeta titulo="Cancelados" valor={pedidos.cancelados} detalle={importes.canceladoCents ? formatearPesos(importes.canceladoCents) : undefined} />
        <Tarjeta titulo="Ticket promedio" valor={importes.ticketPromedioCents === null ? "—" : formatearPesos(importes.ticketPromedioCents)} detalle="De los entregados" />
        <Tarjeta titulo="Ventas completadas" valor={formatearPesos(importes.ventasCents)} detalle="Pedidos entregados" />
        <Tarjeta titulo="Importe de pedidos" valor={formatearPesos(importes.brutoCents)} detalle="Todos menos los cancelados" />
        <Tarjeta titulo="Cobrado" valor={formatearPesos(importes.cobradoCents)} detalle="Marcados como cobrados" />
        <Tarjeta
          titulo="Tiempo de preparación"
          valor={tiempoPreparacion.medianaMinutos === null ? "—" : `${tiempoPreparacion.medianaMinutos} min`}
          detalle={tiempoPreparacion.medianaMinutos === null ? `Se muestra con 10 o más entregados (hay ${tiempoPreparacion.pedidos})` : "Mediana, de confirmado a listo"}
        />
      </dl>

      <div className="grid gap-5 lg:grid-cols-2">
        <Ranking titulo="Productos más pedidos" filas={datos.productos} vacio="Sin pedidos en el período." />
        <Ranking titulo="Categorías más populares" filas={datos.categorias} vacio="Sin pedidos en el período." />
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="font-bold">Retiro y delivery</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-center">
            {(
              [
                ["Retiro", entrega.retiro],
                ["Delivery", entrega.delivery],
              ] as const
            ).map(([nombre, d]) => (
              <div key={nombre} className="rounded-xl bg-stone-50 p-3">
                <dt className="text-sm text-muted">{nombre}</dt>
                <dd className="text-xl font-bold tabular-nums">{d.cantidad}</dd>
                <dd className="text-xs text-muted">{d.porcentaje} %</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="font-bold">Pedidos por estado</h2>
          {datos.estados.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Sin pedidos en el período.</p>
          ) : (
            <ul className="mt-2 divide-y divide-stone-100 text-sm">
              {datos.estados.map((e) => (
                <li key={e.estado} className="flex justify-between py-2">
                  <span>{ETIQUETA_ESTADO[e.estado as EstadoPedido] ?? e.estado}</span>
                  <span className="font-semibold tabular-nums">{e.cantidad}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <Horas horas={datos.horas} />
    </div>
  );
}
