"use client";

import { ArrowLeft, Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatearPesos } from "@/lib/dinero";
import type { MenuPublico, ProductoPublico } from "@/modulos/menu/tipos";
import { LIMITES_PEDIDO } from "@/modulos/pedidos/calculo";
import { aceptarPreciosActuales, cambiarCantidad, evaluarCarrito, quitarItem, reemplazarItem, type ItemCarrito } from "./carrito";
import { useApertura } from "./estado-apertura";
import { HojaProducto } from "./hoja-producto";
import { estiloNegocio } from "./menu-negocio";
import { useCarrito } from "./use-carrito";

/** Página del carrito (RF-006): revisar, cambiar cantidades, editar opciones y quitar. */
export function CarritoVista({ menu }: { menu: MenuPublico }) {
  const { business: negocio } = menu;
  const [carrito, guardar] = useCarrito(negocio.slug);
  const [editando, setEditando] = useState<{ producto: ProductoPublico; item: ItemCarrito } | null>(null);
  const apertura = useApertura(negocio);
  const resumen = evaluarCarrito(menu, carrito);
  const preciosCambiaron = resumen.lineas.some((l) => l.estado === "ok" && l.precioCambio);
  const noDisponibles = resumen.lineas.filter((l) => l.estado === "no_disponible");

  return (
    <div style={estiloNegocio(negocio.primaryColor)} className="min-h-dvh pb-40">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-2 py-2">
          <Link href={`/${negocio.slug}`} aria-label="Volver al menú" className="grid size-11 place-items-center rounded-full hover:bg-stone-100">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <h1 className="text-lg font-bold">Tu pedido</h1>
          <span className="ml-auto truncate pr-3 text-sm text-muted">{negocio.name}</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-4">
        {carrito.items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold">Tu carrito está vacío</p>
            <Link
              href={`/${negocio.slug}`}
              className="mt-4 inline-flex h-12 items-center rounded-full bg-[var(--primary)] px-6 font-semibold text-[var(--primary-foreground)]"
            >
              Ver menú
            </Link>
          </div>
        ) : (
          <>
            {(preciosCambiaron || noDisponibles.length > 0) && (
              <div role="alert" className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">El menú cambió desde que armaste el pedido.</p>
                <p className="mt-1">
                  {noDisponibles.length > 0 && "Quitá los productos marcados para seguir. "}
                  {preciosCambiaron && "Algunos precios cambiaron: ya ves los nuevos."}
                </p>
                {preciosCambiaron && (
                  <button
                    type="button"
                    onClick={() => guardar((c) => aceptarPreciosActuales(c, resumen.lineas, negocio.menuVersion))}
                    className="mt-2 h-11 rounded-full bg-amber-900 px-4 font-semibold text-white"
                  >
                    Aceptar precios nuevos
                  </button>
                )}
              </div>
            )}

            <ul className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
              {resumen.lineas.map((linea) => {
                const { item } = linea;
                const nombre = linea.producto?.name ?? "Producto";
                return (
                  <li key={item.key} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{nombre}</p>
                        {linea.estado === "ok" && linea.detalle && <p className="text-sm text-muted">{linea.detalle}</p>}
                        {item.note && <p className="mt-1 text-sm italic text-muted">“{item.note}”</p>}
                        {linea.estado === "no_disponible" && <p className="mt-1 text-sm font-medium text-red-700">{linea.motivo}</p>}
                        {linea.estado === "ok" && linea.precioCambio && (
                          <p className="mt-1 text-sm text-amber-800">
                            Antes {formatearPesos(item.unitCents)}, ahora {formatearPesos(linea.unitCents)} c/u
                          </p>
                        )}
                      </div>
                      {linea.estado === "ok" && <p className="font-semibold tabular-nums">{formatearPesos(linea.lineCents)}</p>}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      {linea.estado === "ok" && (
                        <>
                          <div className="flex items-center rounded-full border border-stone-200">
                            <button
                              type="button"
                              onClick={() => guardar((c) => cambiarCantidad(c, item.key, item.quantity - 1))}
                              aria-label={`Restar uno de ${nombre}`}
                              className="grid size-11 place-items-center rounded-full"
                            >
                              <Minus className="size-4" aria-hidden />
                            </button>
                            <span className="w-6 text-center font-semibold tabular-nums">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => guardar((c) => cambiarCantidad(c, item.key, item.quantity + 1))}
                              disabled={item.quantity >= LIMITES_PEDIDO.maxQuantity}
                              aria-label={`Sumar uno de ${nombre}`}
                              className="grid size-11 place-items-center rounded-full disabled:opacity-30"
                            >
                              <Plus className="size-4" aria-hidden />
                            </button>
                          </div>
                          {linea.producto.groups.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setEditando({ producto: linea.producto, item })}
                              className="h-11 rounded-full px-4 text-sm font-medium text-[var(--primary)] hover:bg-stone-100"
                            >
                              Editar
                            </button>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => guardar((c) => quitarItem(c, item.key))}
                        aria-label={`Quitar ${nombre}`}
                        className="ml-auto grid size-11 place-items-center rounded-full text-stone-500 hover:bg-stone-100"
                      >
                        <Trash2 className="size-5" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <dl className="mt-4 space-y-1 px-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="font-semibold tabular-nums">{formatearPesos(resumen.subtotalCents)}</dd>
              </div>
              {negocio.deliveryEnabled && (
                <div className="flex justify-between">
                  <dt className="text-muted">Envío a domicilio (si elegís delivery)</dt>
                  <dd className="tabular-nums">{negocio.deliveryFeeCents ? formatearPesos(negocio.deliveryFeeCents) : "Gratis"}</dd>
                </div>
              )}
            </dl>
            {resumen.faltanteMinimoCents > 0 && (
              <p className="mt-3 rounded-2xl bg-stone-100 px-4 py-3 text-sm">
                El pedido mínimo es {formatearPesos(negocio.minOrderCents)}. Te faltan {formatearPesos(resumen.faltanteMinimoCents)}.
              </p>
            )}
          </>
        )}
      </main>

      {carrito.items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto max-w-2xl">
            {apertura?.abierto && !resumen.hayProblemas && resumen.faltanteMinimoCents === 0 ? (
              <Link
                href={`/${negocio.slug}/confirmar`}
                className="flex h-14 w-full items-center justify-between rounded-full bg-[var(--primary)] px-5 font-semibold text-[var(--primary-foreground)]"
              >
                <span>Continuar</span>
                <span className="tabular-nums">{formatearPesos(resumen.subtotalCents)}</span>
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  disabled
                  className="flex h-14 w-full items-center justify-between rounded-full bg-[var(--primary)] px-5 font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
                >
                  <span>Continuar</span>
                  <span className="tabular-nums">{formatearPesos(resumen.subtotalCents)}</span>
                </button>
                <p className="mt-2 text-center text-sm text-muted">
                  {apertura && !apertura.abierto
                    ? "Ahora no estamos tomando pedidos."
                    : resumen.hayProblemas
                      ? "Resolvé los cambios del menú para seguir."
                      : resumen.faltanteMinimoCents > 0
                        ? `Te faltan ${formatearPesos(resumen.faltanteMinimoCents)} para el pedido mínimo.`
                        : ""}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <HojaProducto
        menu={menu}
        producto={editando?.producto ?? null}
        inicial={editando?.item ?? null}
        onCerrar={() => setEditando(null)}
        onConfirmar={(nuevo) => editando && guardar((c) => reemplazarItem(c, editando.item.key, nuevo, negocio.menuVersion))}
      />
    </div>
  );
}
