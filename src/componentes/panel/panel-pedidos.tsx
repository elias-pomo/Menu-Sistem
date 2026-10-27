"use client";

import { AlertTriangle, Bell, BellOff, Bike, Clock, Store, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useHidratado } from "@/componentes/use-hidratado";
import { formatearPesos } from "@/lib/dinero";
import { MOTIVOS_CANCELACION, type MotivoCancelacion } from "@/modulos/pedidos/esquemas";
import { ETIQUETA_ACCION, ETIQUETA_ESTADO, siguienteEstado, type EstadoPedido } from "@/modulos/pedidos/estados";
import type { PedidoPanel } from "@/modulos/pedidos";
import { activarSonido, sonidoActivo } from "./alerta-sonido";
import { ErrorApi, llamarApi } from "./api";
import { BotonAvisos } from "./boton-avisos";
import { PausaPedidos } from "./pausa-pedidos";
import { usePedidos } from "./use-pedidos";

const SECCIONES: { estado: EstadoPedido; titulo: string }[] = [
  { estado: "PENDING", titulo: "Nuevos" },
  { estado: "CONFIRMED", titulo: "Confirmados" },
  { estado: "PREPARING", titulo: "En preparación" },
  { estado: "READY", titulo: "Listos" },
  { estado: "ON_THE_WAY", titulo: "En camino" },
];
const MINUTOS = [15, 30, 45, 60];

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
const minutosDesde = (iso: string, ahora: number) => Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60_000));

/** Pantalla de pedidos del panel (RF-022 a RF-029, sección 10 del plan). */
export function PanelPedidos({ clavePush }: { clavePush: string | null }) {
  const { pedidos, resumen, config, ultimaActualizacion, sinConexion, actualizarPedido, consultar } = usePedidos();
  const hidratado = useHidratado();
  const [sonido, setSonido] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [ahora, setAhora] = useState(() => Date.now());

  // Reloj para la antigüedad y los demorados.
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const pendientes = pedidos.filter((p) => p.status === "PENDING").length;
  useEffect(() => {
    document.title = pendientes ? `(${pendientes}) Pedidos · Panel` : "Pedidos · Panel";
  }, [pendientes]);

  async function accion(llamada: () => Promise<{ order: PedidoPanel }>) {
    setAviso("");
    try {
      actualizarPedido((await llamada()).order);
    } catch (err) {
      if (err instanceof ErrorApi && err.code === "STATUS_CONFLICT") {
        setAviso("Otro usuario ya cambió este pedido. Se actualizó la lista.");
        consultar();
      } else setAviso(err instanceof ErrorApi ? err.message : "Ocurrió un error.");
      throw err;
    }
  }

  const avanzar = (p: PedidoPanel, minutos?: number) => {
    const destino = siguienteEstado(p.status, p.fulfillment);
    if (!destino) return Promise.resolve();
    return accion(() =>
      llamarApi("POST", `/api/v1/admin/orders/${p.id}/transition`, { toStatus: destino, expectedStatus: p.status, estimatedMinutes: minutos ?? null }),
    ).catch(() => {});
  };

  const activos = pedidos.filter((p) => SECCIONES.some((s) => s.estado === p.status));
  const terminados = pedidos.filter((p) => p.status === "DELIVERED" || p.status === "CANCELLED").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const seleccionado = pedidos.find((p) => p.id === abierto) ?? null;
  const bloqueado = sinConexion || !hidratado;

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">Pedidos</h1>
        <button
          type="button"
          onClick={async () => setSonido(await activarSonido())}
          className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium ${sonido && sonidoActivo() ? "bg-emerald-50 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
        >
          {sonido && sonidoActivo() ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
          {sonido && sonidoActivo() ? "Sonido activado" : "Activar sonido"}
        </button>
        <BotonAvisos clavePublica={clavePush} />
        <PausaPedidos aceptando={config.acceptingOrders} onCambio={() => consultar()} />
      </div>
      {sinConexion && (
        <p role="alert" className="mt-3 flex items-center gap-2 rounded-xl bg-yellow-100 px-4 py-3 text-sm text-yellow-900">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          Sin conexión{ultimaActualizacion ? `, mostrando datos de las ${hora(ultimaActualizacion.toISOString())}` : ""}. Los cambios de estado están bloqueados.
        </p>
      )}
      {aviso && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {aviso}
        </p>
      )}

      {resumen && (
        <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
          {(
            [
              ["Hoy", resumen.recibidos],
              ["Entregados", resumen.entregados],
              ["Cancelados", resumen.cancelados],
              ["Ventas", formatearPesos(resumen.ventasCents)],
            ] as const
          ).map(([titulo, valor]) => (
            <div key={titulo} className="rounded-2xl bg-white px-2 py-3">
              <dt className="text-xs text-muted">{titulo}</dt>
              <dd className="mt-0.5 font-bold tabular-nums">{valor}</dd>
            </div>
          ))}
        </dl>
      )}

      {ultimaActualizacion && activos.length === 0 && <p className="mt-8 text-center text-muted">Todavía no hay pedidos activos.</p>}

      <div className="mt-5 grid gap-5 lg:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
        {SECCIONES.map(({ estado, titulo }) => {
          const lista = activos.filter((p) => p.status === estado).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          if (!lista.length) return null;
          return (
            <section key={estado} aria-labelledby={`seccion-${estado}`}>
              <h2 id={`seccion-${estado}`} className="mb-2 font-bold">
                {titulo} <span className="text-muted">({lista.length})</span>
              </h2>
              <ul className="flex flex-col gap-3">
                {lista.map((p) => (
                  <li key={p.id}>
                    <TarjetaPedido
                      pedido={p}
                      ahora={ahora}
                      alertaMin={config.pendingAlertMinutes}
                      bloqueado={bloqueado}
                      onAvanzar={(minutos) => avanzar(p, minutos)}
                      onAbrir={() => setAbierto(p.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {terminados.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer py-2 font-semibold">Terminados hoy ({terminados.length})</summary>
          <ul className="mt-2 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
            {terminados.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setAbierto(p.id)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left">
                  <span className="font-mono font-bold">{p.code}</span>
                  <span className="flex-1 truncate">{p.customerName ?? "—"}</span>
                  <span className={`text-sm ${p.status === "CANCELLED" ? "text-red-700" : "text-muted"}`}>{ETIQUETA_ESTADO[p.status]}</span>
                  <span className="tabular-nums">{formatearPesos(p.totalCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {seleccionado && (
        <DetallePedido
          pedido={seleccionado}
          bloqueado={bloqueado}
          onCerrar={() => setAbierto(null)}
          onAvanzar={(minutos) => avanzar(seleccionado, minutos)}
          onAccion={accion}
        />
      )}
    </section>
  );
}

function Demora({ pedido, ahora, alertaMin }: { pedido: PedidoPanel; ahora: number; alertaMin: number }) {
  // RN-16: pendiente sin respuesta, o más tiempo que el estimado. No es un estado: solo un aviso.
  const pendienteDemorado = pedido.status === "PENDING" && minutosDesde(pedido.createdAt, ahora) >= alertaMin;
  const pasado = pedido.confirmedAt && pedido.estimatedMinutes && minutosDesde(pedido.confirmedAt, ahora) > pedido.estimatedMinutes;
  if (!pendienteDemorado && !pasado) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
      <AlertTriangle className="size-3" aria-hidden />
      Demorado
    </span>
  );
}

function TarjetaPedido({
  pedido: p,
  ahora,
  alertaMin,
  bloqueado,
  onAvanzar,
  onAbrir,
}: {
  pedido: PedidoPanel;
  ahora: number;
  alertaMin: number;
  bloqueado: boolean;
  onAvanzar: (minutos?: number) => Promise<void>;
  onAbrir: () => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const destino = siguienteEstado(p.status, p.fulfillment);
  const unidades = p.items.reduce((s, i) => s + i.quantity, 0);
  const notas = [p.note, ...p.items.map((i) => i.note && `${i.name}: ${i.note}`)].filter(Boolean);

  const ejecutar = async (minutos?: number) => {
    setEnviando(true);
    await onAvanzar(minutos);
    setEnviando(false);
    setEligiendo(false);
  };

  return (
    <article className={`rounded-2xl border-2 bg-white p-4 ${p.status === "PENDING" ? "border-primary" : "border-stone-200"}`} aria-label={`Pedido ${p.code}`}>
      <button type="button" onClick={onAbrir} className="block w-full text-left">
        <div className="flex items-start gap-2">
          <span className="font-mono text-2xl font-bold">{p.code}</span>
          <Demora pedido={p} ahora={ahora} alertaMin={alertaMin} />
          <span className="ml-auto text-right text-sm text-muted">
            {hora(p.createdAt)}
            <span className="block">hace {minutosDesde(p.createdAt, ahora)} min</span>
          </span>
        </div>
        <p className="mt-1 font-medium">{p.customerName}</p>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
          {p.fulfillment === "DELIVERY" ? <Bike className="size-4" aria-hidden /> : <Store className="size-4" aria-hidden />}
          {p.fulfillment === "DELIVERY" ? `Delivery${p.address?.neighborhood ? ` · ${p.address.neighborhood}` : ""}` : "Retiro"} · {unidades} {unidades === 1 ? "producto" : "productos"} ·{" "}
          <span className="font-semibold text-foreground">{formatearPesos(p.totalCents)}</span>
        </p>
        {notas.length > 0 && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">{notas.join(" · ")}</p>}
        {p.estimatedMinutes && p.status !== "PENDING" && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted">
            <Clock className="size-3" aria-hidden /> {p.estimatedMinutes} min estimados
          </p>
        )}
      </button>

      {destino &&
        (eligiendo ? (
          <div className="mt-3">
            <p className="text-sm font-medium">¿En cuánto está listo?</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {MINUTOS.map((m) => (
                <button key={m} type="button" disabled={bloqueado || enviando} onClick={() => ejecutar(m)} className="h-11 rounded-xl border border-stone-300 font-semibold disabled:opacity-40">
                  {m}′
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setEligiendo(false)} className="mt-2 h-11 w-full text-sm text-muted">
              Volver
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={bloqueado || enviando}
            onClick={() => (p.status === "PENDING" ? setEligiendo(true) : ejecutar())}
            className="mt-3 h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40"
          >
            {enviando ? "…" : ETIQUETA_ACCION[destino]}
          </button>
        ))}
    </article>
  );
}

function DetallePedido({
  pedido: p,
  bloqueado,
  onCerrar,
  onAvanzar,
  onAccion,
}: {
  pedido: PedidoPanel;
  bloqueado: boolean;
  onCerrar: () => void;
  onAvanzar: (minutos?: number) => Promise<void>;
  onAccion: (llamada: () => Promise<{ order: PedidoPanel }>) => Promise<void>;
}) {
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoCancelacion | "">("");
  const [nota, setNota] = useState("");
  const terminado = p.status === "DELIVERED" || p.status === "CANCELLED";

  useEffect(() => {
    const cerrarConEsc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", cerrarConEsc);
    return () => window.removeEventListener("keydown", cerrarConEsc);
  }, [onCerrar]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="detalle-titulo" className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-background p-5 shadow-xl">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h2 id="detalle-titulo" className="font-mono text-3xl font-bold">
              {p.code}
            </h2>
            <p className={`font-medium ${p.status === "CANCELLED" ? "text-red-700" : ""}`}>{ETIQUETA_ESTADO[p.status]}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="grid size-11 place-items-center rounded-full hover:bg-stone-100">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <section className="mt-4 rounded-2xl bg-white p-4 text-sm">
          <p className="font-semibold">{p.customerName ?? "Datos anonimizados"}</p>
          {p.customerPhone && (
            <a href={`tel:${p.customerPhone}`} className="text-primary underline">
              {p.customerPhone}
            </a>
          )}
          {p.fulfillment === "DELIVERY" && p.address ? (
            <p className="mt-2">
              {p.address.street} {p.address.number}
              {p.address.unit && `, ${p.address.unit}`} — {p.address.neighborhood}
              {p.address.reference && <span className="block text-muted">{p.address.reference}</span>}
            </p>
          ) : (
            <p className="mt-2 text-muted">Retira en el local</p>
          )}
        </section>

        <section className="mt-3 rounded-2xl bg-white p-4 text-sm">
          <ul className="divide-y divide-stone-100">
            {p.items.map((i) => (
              <li key={i.id} className="flex gap-3 py-2">
                <span className="font-bold tabular-nums">{i.quantity}×</span>
                <span className="flex-1">
                  {i.name}
                  {i.options.length > 0 && <span className="block text-muted">{i.options.map((o) => o.name).join(" · ")}</span>}
                  {i.note && <span className="mt-1 block rounded-lg bg-amber-50 px-2 py-1 text-amber-950">{i.note}</span>}
                </span>
                <span className="tabular-nums">{formatearPesos(i.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          {p.note && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-950">{p.note}</p>}
          <dl className="mt-2 space-y-1 border-t border-stone-100 pt-2">
            {p.deliveryFeeCents > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Envío</dt>
                <dd className="tabular-nums">{formatearPesos(p.deliveryFeeCents)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatearPesos(p.totalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Pago</dt>
              <dd>
                {p.paymentMethod === "CASH" ? "Efectivo" : "Transferencia"}
                {p.cashChangeForCents ? ` · paga con ${formatearPesos(p.cashChangeForCents)}` : ""}
              </dd>
            </div>
          </dl>
          {p.status !== "CANCELLED" && (
            <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={!!p.paidAt}
                disabled={bloqueado}
                onChange={() => onAccion(() => llamarApi("POST", `/api/v1/admin/orders/${p.id}/paid`, { paid: !p.paidAt })).catch(() => {})}
                className="size-5 accent-emerald-700"
              />
              Cobrado{p.paidAt ? ` (${hora(p.paidAt)})` : ""}
            </label>
          )}
        </section>

        <section className="mt-3 text-sm">
          <h3 className="font-semibold">Historial</h3>
          <ol className="mt-1 space-y-1 text-muted">
            {p.history.map((h, i) => (
              <li key={i}>
                {hora(h.at)} · {ETIQUETA_ESTADO[h.to]}
                {h.reason && h.to === "CANCELLED" ? ` (${MOTIVOS_CANCELACION[h.reason as MotivoCancelacion] ?? h.reason})` : h.reason ? ` (${h.reason})` : ""}
              </li>
            ))}
          </ol>
          {p.cancelNote && <p className="mt-1">Nota: {p.cancelNote}</p>}
        </section>

        {!terminado && (
          <div className="mt-auto flex flex-col gap-2 pt-5">
            {p.status !== "PENDING" && siguienteEstado(p.status, p.fulfillment) && (
              <button type="button" disabled={bloqueado} onClick={() => onAvanzar()} className="h-12 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40">
                {ETIQUETA_ACCION[siguienteEstado(p.status, p.fulfillment)!]}
              </button>
            )}
            {cancelando ? (
              <form
                method="post"
                className="flex flex-col gap-2 rounded-2xl border border-red-200 bg-white p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!motivo) return;
                  onAccion(() => llamarApi("POST", `/api/v1/admin/orders/${p.id}/cancel`, { expectedStatus: p.status, reason: motivo, note: nota || null }))
                    .then(() => setCancelando(false))
                    .catch(() => {});
                }}
              >
                <label className="text-sm font-medium" htmlFor="motivo">
                  Motivo
                </label>
                <select id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoCancelacion)} required className="h-11 rounded-xl border border-stone-300 bg-white px-3">
                  <option value="">Elegí un motivo</option>
                  {Object.entries(MOTIVOS_CANCELACION).map(([valor, texto]) => (
                    <option key={valor} value={valor}>
                      {texto}
                    </option>
                  ))}
                </select>
                <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="Nota (opcional)" aria-label="Nota de la cancelación" className="h-11 rounded-xl border border-stone-300 bg-white px-3" />
                <div className="flex gap-2">
                  <button type="submit" disabled={!motivo || bloqueado} className="h-11 flex-1 rounded-full bg-red-700 font-semibold text-white disabled:opacity-40">
                    Cancelar pedido
                  </button>
                  <button type="button" onClick={() => setCancelando(false)} className="h-11 rounded-full border border-stone-300 px-4">
                    Volver
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" disabled={bloqueado} onClick={() => setCancelando(true)} className="h-12 rounded-full border border-red-200 font-medium text-red-700 disabled:opacity-40">
                {p.status === "PENDING" ? "Rechazar" : "Cancelar"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
