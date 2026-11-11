"use client";

import { Check, Minus, Plus, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatearPesos } from "@/lib/dinero";
import { productosParaCalculo, type GrupoPublico, type MenuPublico, type ProductoPublico } from "@/modulos/menu/tipos";
import { calcularPedido, LIMITES_PEDIDO } from "@/modulos/pedidos/calculo";
import type { ItemCarrito } from "./carrito";

type Props = {
  menu: MenuPublico;
  producto: ProductoPublico | null;
  /** Al editar desde el carrito: el ítem con sus opciones elegidas. */
  inicial?: ItemCarrito | null;
  onCerrar: () => void;
  onConfirmar: (item: Omit<ItemCarrito, "key">) => void;
};

const SALIDA_MS = 220;
/** Arrastre hacia abajo que cierra la hoja, o un gesto rápido aunque sea corto (px/ms). */
const UMBRAL_PX = 120;
const UMBRAL_VELOCIDAD = 0.5;

/**
 * Hoja inferior para elegir opciones, cantidad y nota (RF-004, RF-005). Entra desde abajo, sale más
 * rápido de lo que entra y se cierra arrastrándola hacia abajo desde la manija o el título.
 */
export function HojaProducto({ menu, producto, inicial, onCerrar, onConfirmar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLFormElement>(null);
  const [cerrando, setCerrando] = useState(false);
  const arrastre = useRef<{ y: number; t: number; dy: number } | null>(null);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (producto && !d.open) {
      setCerrando(false);
      d.showModal();
    }
    if (!producto && d.open) d.close();
  }, [producto]);

  /** Anima la salida y recién después cierra el diálogo (Escape, fondo, X o arrastre). */
  const cerrar = useCallback(() => {
    const d = dialogo.current;
    if (!d?.open || cerrando) return;
    setCerrando(true);
    window.setTimeout(() => d.close(), SALIDA_MS);
  }, [cerrando]);

  function empezarArrastre(e: React.PointerEvent) {
    if (arrastre.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    // Solo el primer dedo: si entra otro, se ignora (si no, la hoja salta).
    arrastre.current = { y: e.clientY, t: performance.now(), dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function moverArrastre(e: React.PointerEvent) {
    const a = arrastre.current;
    const p = panel.current;
    if (!a || !p) return;
    const dy = e.clientY - a.y;
    // Hacia arriba ofrece resistencia en lugar de frenar en seco.
    a.dy = dy > 0 ? dy : -Math.sqrt(-dy) * 2;
    p.style.transition = "none";
    p.style.transform = `translateY(${a.dy}px)`;
  }
  function soltarArrastre() {
    const a = arrastre.current;
    const p = panel.current;
    arrastre.current = null;
    if (!a || !p) return;
    const velocidad = a.dy / (performance.now() - a.t);
    p.style.transition = "";
    p.style.transform = "";
    if (a.dy > UMBRAL_PX || velocidad > UMBRAL_VELOCIDAD) {
      // Sigue desde donde quedó el dedo hasta abajo.
      p.animate([{ transform: `translateY(${a.dy}px)` }, { transform: "translateY(100%)" }], { duration: SALIDA_MS, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "forwards" });
      cerrar();
    }
  }

  return (
    <dialog
      ref={dialogo}
      onClose={() => {
        setCerrando(false);
        panel.current?.getAnimations().forEach((a) => a.cancel());
        onCerrar();
      }}
      onCancel={(e) => {
        e.preventDefault();
        cerrar();
      }}
      onClick={(e) => e.target === e.currentTarget && cerrar()}
      aria-labelledby="hoja-titulo"
      data-cerrando={cerrando || undefined}
      className="group/hoja m-0 mt-auto max-h-none w-full max-w-none bg-transparent p-0 text-tinta backdrop:bg-black/0 backdrop:backdrop-blur-[1px] backdrop:transition-[background-color] backdrop:duration-300 open:backdrop:bg-black/45 data-[cerrando]:backdrop:bg-black/0 data-[cerrando]:backdrop:duration-200 starting:open:backdrop:bg-black/0 sm:m-auto sm:max-w-lg"
    >
      {producto && (
        <Contenido
          key={`${producto.id}-${inicial?.key ?? ""}`}
          refPanel={panel}
          menu={menu}
          producto={producto}
          inicial={inicial ?? null}
          onCerrar={cerrar}
          arrastre={{ onPointerDown: empezarArrastre, onPointerMove: moverArrastre, onPointerUp: soltarArrastre, onPointerCancel: soltarArrastre }}
          onConfirmar={(item) => {
            onConfirmar(item);
            cerrar();
          }}
        />
      )}
    </dialog>
  );
}

function seleccionInicial(producto: ProductoPublico, inicial: ItemCarrito | null): Record<string, string[]> {
  return Object.fromEntries(
    producto.groups.map((g) => {
      if (inicial) return [g.id, g.options.filter((o) => inicial.optionIds.includes(o.id)).map((o) => o.id)];
      // Grupo obligatorio de una sola opción: viene elegida la primera disponible (más rápido de pedir).
      const primera = g.options.find((o) => o.isAvailable);
      return [g.id, g.minSelect === 1 && g.maxSelect === 1 && primera ? [primera.id] : []];
    }),
  );
}

function ayudaGrupo(g: GrupoPublico) {
  const unica = g.maxSelect === 1;
  if (g.minSelect >= 1) return unica ? "Elegí 1" : g.minSelect === g.maxSelect ? `Elegí ${g.minSelect}` : `Elegí entre ${g.minSelect} y ${g.maxSelect}`;
  return unica ? "Opcional" : `Opcional, hasta ${g.maxSelect}`;
}

type Arrastre = Pick<React.HTMLAttributes<HTMLElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel">;

function Contenido({
  refPanel,
  menu,
  producto,
  inicial,
  onCerrar,
  onConfirmar,
  arrastre,
}: {
  refPanel: React.RefObject<HTMLFormElement | null>;
  menu: MenuPublico;
  producto: ProductoPublico;
  inicial: ItemCarrito | null;
  onCerrar: () => void;
  onConfirmar: (item: Omit<ItemCarrito, "key">) => void;
  arrastre: Arrastre;
}) {
  const [seleccion, setSeleccion] = useState(() => seleccionInicial(producto, inicial));
  const [cantidad, setCantidad] = useState(inicial?.quantity ?? 1);
  const [nota, setNota] = useState(inicial?.note ?? "");
  const [intento, setIntento] = useState(false);
  const productos = useMemo(() => productosParaCalculo(menu), [menu]);

  const optionIds = producto.groups.flatMap((g) => seleccion[g.id] ?? []);
  const notaLimpia = nota.trim() || null;
  const resultado = calcularPedido(
    { fulfillment: "PICKUP", paymentMethod: "CASH", items: [{ productId: producto.id, quantity: cantidad, optionIds, note: notaLimpia }] },
    productos,
    { deliveryEnabled: true, deliveryFeeCents: 0, minOrderCents: 0, acceptCash: true, acceptTransfer: true },
  );
  const errores = resultado.ok || resultado.code !== "VALIDATION_ERROR" ? {} : resultado.fields;
  const linea = resultado.ok ? resultado.lines[0] : null;
  const unitario = linea ? linea.unitPriceCents + linea.optionsTotalCents : producto.priceCents;

  function alternar(grupoId: string, opcionId: string, unica: boolean) {
    setSeleccion((s) => {
      const actuales = s[grupoId] ?? [];
      if (unica) return { ...s, [grupoId]: [opcionId] };
      return { ...s, [grupoId]: actuales.includes(opcionId) ? actuales.filter((o) => o !== opcionId) : [...actuales, opcionId] };
    });
  }

  return (
    <form
      ref={refPanel}
      method="dialog"
      onSubmit={(e) => {
        e.preventDefault();
        if (!linea) {
          setIntento(true);
          return;
        }
        onConfirmar({ productId: producto.id, quantity: cantidad, optionIds, note: notaLimpia, unitCents: unitario });
      }}
      className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[1.75rem] bg-superficie shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.35)] transition-transform duration-[420ms] ease-hoja will-change-transform group-data-[cerrando]/hoja:translate-y-full group-data-[cerrando]/hoja:duration-[220ms] starting:translate-y-full mantel:rounded-t-xl sm:rounded-[1.75rem] sm:mantel:rounded-xl"
    >
      <header {...arrastre} className="relative shrink-0 touch-none select-none px-5 pt-3">
        <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-tinta/20 sm:hidden" />
        {producto.imageUrl && (
          <Image src={producto.imageUrl} alt="" width={720} height={400} className="pointer-events-none mb-4 aspect-[9/5] w-full rounded-tarjeta object-cover" />
        )}
        <div className="flex items-start gap-3 pb-4">
          <div className="min-w-0 flex-1">
            <h2 id="hoja-titulo" className="titulo text-[1.85rem] nocturno:text-[2.1rem] mantel:italic">
              {producto.name}
            </h2>
            {producto.description && <p className="mt-2 text-[15px] leading-relaxed text-tinta-suave">{producto.description}</p>}
            <p className="mt-2 text-[15px] font-medium tabular-nums text-tinta">{formatearPesos(producto.priceCents)}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Cerrar"
            className="presionable -mr-2 grid size-11 shrink-0 place-items-center rounded-full bg-realce text-tinta hover:bg-linea"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain border-t border-linea px-5 pb-2 pt-5">
        {producto.groups.map((grupo) => {
          const unica = grupo.maxSelect === 1;
          const elegidas = seleccion[grupo.id] ?? [];
          const error = errores[`items.0.groups.${grupo.id}`];
          const completo = elegidas.length >= Math.max(grupo.minSelect, 1) && (grupo.minSelect > 0 || elegidas.length > 0);
          const obligatorio = grupo.minSelect > 0;
          return (
            <fieldset key={grupo.id} className="mb-7" aria-describedby={error ? `error-${grupo.id}` : undefined}>
              <legend className="mb-3 flex w-full items-start gap-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[17px] font-semibold leading-snug">{grupo.name}</span>
                  <span className="text-[14px] text-tinta-suave">{ayudaGrupo(grupo)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-[13px] font-medium tabular-nums">
                  {!unica && (
                    <span className="text-tinta-suave">
                      {elegidas.length}/{grupo.maxSelect}
                    </span>
                  )}
                  {obligatorio && (
                    <span
                      className={`inline-flex h-6 items-center gap-1 rounded-full px-2 transition-colors duration-200 ${
                        completo ? "bg-emerald-600/12 text-emerald-800 nocturno:text-emerald-400" : intento && error ? "bg-red-600/10 text-red-700 nocturno:text-red-400" : "bg-realce text-tinta-suave"
                      }`}
                    >
                      {completo && <Check aria-hidden className="size-3.5" strokeWidth={3} />}
                      {completo ? "Listo" : "Obligatorio"}
                    </span>
                  )}
                </span>
              </legend>
              <div className="overflow-hidden rounded-tarjeta border border-linea">
                {grupo.options.map((opcion, i) => {
                  const marcada = elegidas.includes(opcion.id);
                  const lleno = !unica && !marcada && elegidas.length >= grupo.maxSelect;
                  const deshabilitada = !opcion.isAvailable || lleno;
                  return (
                    <label
                      key={opcion.id}
                      className={`flex min-h-14 items-center gap-3.5 px-4 py-2 transition-colors duration-150 ${i ? "border-t border-linea" : ""} ${
                        deshabilitada ? "cursor-not-allowed" : "cursor-pointer active:bg-realce"
                      } ${marcada ? "bg-realce/70" : ""}`}
                    >
                      <input
                        type={unica ? "radio" : "checkbox"}
                        name={grupo.id}
                        checked={marcada}
                        disabled={deshabilitada}
                        onChange={() => alternar(grupo.id, opcion.id, unica)}
                        className="peer sr-only"
                      />
                      {/* Indicador propio: círculo para elegir una, cuadrado para varias. */}
                      <span
                        aria-hidden
                        className={`grid size-[1.375rem] shrink-0 place-items-center border-[1.5px] transition-[background-color,border-color,transform] duration-200 ease-salida peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-acento peer-active:scale-90 ${
                          unica ? "rounded-full" : "rounded-[0.4rem]"
                        } ${marcada ? "border-acento bg-acento text-sobre-acento" : deshabilitada ? "border-linea" : "border-tinta/30"}`}
                      >
                        {unica ? (
                          <span className={`size-2 rounded-full bg-sobre-acento transition-[transform,opacity] duration-200 ease-salida ${marcada ? "" : "scale-0 opacity-0"}`} />
                        ) : (
                          <Check strokeWidth={3} className={`size-3.5 transition-[transform,opacity] duration-200 ease-salida ${marcada ? "" : "scale-50 opacity-0"}`} />
                        )}
                      </span>
                      <span className={`flex-1 text-[16px] ${!opcion.isAvailable ? "text-tinta-suave line-through decoration-1" : lleno ? "text-tinta-suave" : ""}`}>{opcion.name}</span>
                      {!opcion.isAvailable ? (
                        <span className="text-[13px] text-tinta-suave">Agotado</span>
                      ) : (
                        opcion.priceDeltaCents > 0 && <span className="text-[14px] tabular-nums text-tinta-suave">+ {formatearPesos(opcion.priceDeltaCents)}</span>
                      )}
                    </label>
                  );
                })}
              </div>
              {error && intento && (
                <p id={`error-${grupo.id}`} className="mt-2 text-[14px] text-red-700 nocturno:text-red-400">
                  {error}
                </p>
              )}
            </fieldset>
          );
        })}

        <label className="mb-4 block">
          <span className="text-[17px] font-semibold">Aclaraciones</span>
          <span className="ml-2 text-[14px] text-tinta-suave">Opcional</span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={LIMITES_PEDIDO.maxItemNote}
            rows={2}
            placeholder="Ej.: bien cocida, sin sal"
            className="mt-3 w-full resize-none rounded-tarjeta border border-linea bg-lienzo px-4 py-3 text-tinta outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-tinta-suave/70 focus:border-acento focus:ring-4 focus:ring-acento/15"
          />
        </label>
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-linea bg-superficie px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex h-14 items-center rounded-full border border-linea mantel:rounded-tarjeta">
          <button
            type="button"
            onClick={() => setCantidad((c) => Math.max(1, c - 1))}
            disabled={cantidad <= 1}
            aria-label="Restar uno"
            className="presionable grid size-12 place-items-center rounded-full text-tinta disabled:text-tinta/25"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <span className="w-7 text-center text-[17px] font-semibold tabular-nums" aria-live="polite">
            {cantidad}
          </span>
          <button
            type="button"
            onClick={() => setCantidad((c) => Math.min(LIMITES_PEDIDO.maxQuantity, c + 1))}
            disabled={cantidad >= LIMITES_PEDIDO.maxQuantity}
            aria-label="Sumar uno"
            className="presionable grid size-12 place-items-center rounded-full text-tinta disabled:text-tinta/25"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        <button
          type="submit"
          aria-disabled={!linea}
          className={`presionable flex h-14 flex-1 items-center justify-between rounded-full bg-acento px-5 text-[16px] font-semibold text-sobre-acento transition-[opacity,transform] mantel:rounded-tarjeta ${linea ? "" : "opacity-55"}`}
        >
          <span>{inicial ? "Guardar" : "Agregar"}</span>
          <span className="tabular-nums">{formatearPesos(linea ? linea.lineTotalCents : unitario * cantidad)}</span>
        </button>
      </footer>
    </form>
  );
}
