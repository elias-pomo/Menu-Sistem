"use client";

import { Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatearPesos } from "@/lib/dinero";
import { productosParaCalculo, type MenuPublico, type ProductoPublico } from "@/modulos/menu/tipos";
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

/** Hoja inferior para elegir opciones, cantidad y nota (RF-004, RF-005). */
export function HojaProducto({ menu, producto, inicial, onCerrar, onConfirmar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (producto && !d.open) d.showModal();
    if (!producto && d.open) d.close();
  }, [producto]);

  return (
    <dialog
      ref={dialogo}
      onClose={onCerrar}
      onClick={(e) => e.target === e.currentTarget && dialogo.current?.close()}
      aria-labelledby="hoja-titulo"
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-black/50 sm:m-auto sm:max-w-lg"
    >
      {producto && (
        <Contenido
          key={`${producto.id}-${inicial?.key ?? ""}`}
          menu={menu}
          producto={producto}
          inicial={inicial ?? null}
          onCerrar={() => dialogo.current?.close()}
          onConfirmar={(item) => {
            onConfirmar(item);
            dialogo.current?.close();
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

function Contenido({
  menu,
  producto,
  inicial,
  onCerrar,
  onConfirmar,
}: {
  menu: MenuPublico;
  producto: ProductoPublico;
  inicial: ItemCarrito | null;
  onCerrar: () => void;
  onConfirmar: (item: Omit<ItemCarrito, "key">) => void;
}) {
  const [seleccion, setSeleccion] = useState(() => seleccionInicial(producto, inicial));
  const [cantidad, setCantidad] = useState(inicial?.quantity ?? 1);
  const [nota, setNota] = useState(inicial?.note ?? "");
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

  function alternar(grupoId: string, opcionId: string, unica: boolean) {
    setSeleccion((s) => {
      const actuales = s[grupoId] ?? [];
      if (unica) return { ...s, [grupoId]: [opcionId] };
      return { ...s, [grupoId]: actuales.includes(opcionId) ? actuales.filter((o) => o !== opcionId) : [...actuales, opcionId] };
    });
  }

  return (
    <form
      method="dialog"
      onSubmit={(e) => {
        e.preventDefault();
        if (!linea) return;
        onConfirmar({
          productId: producto.id,
          quantity: cantidad,
          optionIds,
          note: notaLimpia,
          unitCents: linea.unitPriceCents + linea.optionsTotalCents,
        });
      }}
      className="flex max-h-[90dvh] flex-col rounded-t-3xl bg-white text-foreground shadow-xl sm:rounded-3xl"
    >
      <header className="flex items-start gap-3 border-b border-stone-100 px-5 pb-3 pt-5">
        <div className="min-w-0 flex-1">
          <h2 id="hoja-titulo" className="text-xl font-semibold">
            {producto.name}
          </h2>
          {producto.description && <p className="mt-1 text-sm text-muted">{producto.description}</p>}
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-full hover:bg-stone-100">
          <X className="size-5" aria-hidden />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {producto.groups.map((grupo) => {
          const unica = grupo.maxSelect === 1;
          const elegidas = seleccion[grupo.id] ?? [];
          const error = errores[`items.0.groups.${grupo.id}`];
          const ayuda =
            grupo.minSelect >= 1
              ? unica
                ? "Elegí 1"
                : `Elegí entre ${grupo.minSelect} y ${grupo.maxSelect}`
              : unica
                ? "Opcional"
                : `Opcional, hasta ${grupo.maxSelect}`;
          return (
            <fieldset key={grupo.id} className="mb-5" aria-describedby={error ? `error-${grupo.id}` : undefined}>
              <legend className="flex w-full items-baseline justify-between gap-2">
                <span className="font-semibold">{grupo.name}</span>
                <span className="text-sm text-muted">{ayuda}</span>
              </legend>
              <div className="mt-2 divide-y divide-stone-100 rounded-2xl border border-stone-200">
                {grupo.options.map((opcion) => {
                  const marcada = elegidas.includes(opcion.id);
                  const lleno = !unica && !marcada && elegidas.length >= grupo.maxSelect;
                  const deshabilitada = !opcion.isAvailable || lleno;
                  return (
                    <label
                      key={opcion.id}
                      className={`flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 ${deshabilitada ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <input
                        type={unica ? "radio" : "checkbox"}
                        name={grupo.id}
                        checked={marcada}
                        disabled={deshabilitada}
                        onChange={() => alternar(grupo.id, opcion.id, unica)}
                        className="size-5 accent-[var(--primary)]"
                      />
                      <span className="flex-1">{opcion.name}</span>
                      {!opcion.isAvailable ? (
                        <span className="text-sm text-muted">Agotado</span>
                      ) : (
                        opcion.priceDeltaCents > 0 && <span className="text-sm text-muted">+ {formatearPesos(opcion.priceDeltaCents)}</span>
                      )}
                    </label>
                  );
                })}
              </div>
              {error && (
                <p id={`error-${grupo.id}`} className="mt-1 text-sm text-red-700">
                  {error}
                </p>
              )}
            </fieldset>
          );
        })}

        <label className="block">
          <span className="font-semibold">Aclaraciones</span>
          <span className="ml-2 text-sm text-muted">Opcional</span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={LIMITES_PEDIDO.maxItemNote}
            rows={2}
            placeholder="Ej.: bien cocida, sin sal"
            className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none focus:border-[var(--primary)]"
          />
        </label>
      </div>

      <footer className="flex items-center gap-3 border-t border-stone-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center rounded-full border border-stone-200">
          <button
            type="button"
            onClick={() => setCantidad((c) => Math.max(1, c - 1))}
            disabled={cantidad <= 1}
            aria-label="Restar uno"
            className="grid size-11 place-items-center rounded-full disabled:opacity-30"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
            {cantidad}
          </span>
          <button
            type="button"
            onClick={() => setCantidad((c) => Math.min(LIMITES_PEDIDO.maxQuantity, c + 1))}
            disabled={cantidad >= LIMITES_PEDIDO.maxQuantity}
            aria-label="Sumar uno"
            className="grid size-11 place-items-center rounded-full disabled:opacity-30"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        <button
          type="submit"
          disabled={!linea}
          className="flex h-12 flex-1 items-center justify-between rounded-full bg-[var(--primary)] px-5 font-semibold text-[var(--primary-foreground)] disabled:opacity-40"
        >
          <span>{inicial ? "Guardar" : "Agregar"}</span>
          <span className="tabular-nums">{linea ? formatearPesos(linea.lineTotalCents) : ""}</span>
        </button>
      </footer>
    </form>
  );
}
