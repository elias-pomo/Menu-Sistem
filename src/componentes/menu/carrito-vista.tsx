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
import { MarcoMenu } from "./marco";
import { useCarrito } from "./use-carrito";

/** Barra superior de las pantallas del pedido: volver, título y nombre del local. */
export function BarraSuperior({ volver, etiquetaVolver, titulo, local }: { volver: string; etiquetaVolver: string; titulo: string; local: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-linea bg-lienzo/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-2xl items-center gap-2 px-2">
        <Link href={volver} aria-label={etiquetaVolver} className="presionable grid size-11 place-items-center rounded-full text-tinta hover:bg-realce">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <h1 className="titulo truncate text-[1.5rem] nocturno:text-[1.8rem] mantel:italic">{titulo}</h1>
        <span className="ml-auto hidden truncate pr-3 text-[14px] text-tinta-suave sm:block">{local}</span>
      </div>
    </header>
  );
}

/** Botón principal fijo abajo, con el total a la derecha. */
export const BOTON_PRINCIPAL =
  "presionable flex h-14 w-full items-center justify-between rounded-full bg-acento px-6 text-[16px] font-semibold text-sobre-acento mantel:rounded-tarjeta disabled:opacity-50 aria-disabled:opacity-50";

/** Página del carrito (RF-006): revisar, cambiar cantidades, editar opciones y quitar. */
export function CarritoVista({ menu }: { menu: MenuPublico }) {
  const { business: negocio } = menu;
  const [carrito, guardar] = useCarrito(negocio.slug);
  const [editando, setEditando] = useState<{ producto: ProductoPublico; item: ItemCarrito } | null>(null);
  const apertura = useApertura(negocio);
  const resumen = evaluarCarrito(menu, carrito);
  const preciosCambiaron = resumen.lineas.some((l) => l.estado === "ok" && l.precioCambio);
  const noDisponibles = resumen.lineas.filter((l) => l.estado === "no_disponible");
  const avanceMinimo = negocio.minOrderCents ? Math.min(1, resumen.subtotalCents / negocio.minOrderCents) : 1;

  return (
    <MarcoMenu estilo={negocio.menuStyle} color={negocio.primaryColor} className="pb-44">
      <BarraSuperior volver={`/${negocio.slug}`} etiquetaVolver="Volver al menú" titulo="Tu pedido" local={negocio.name} />

      <main className="mx-auto max-w-2xl px-5 pt-5">
        {carrito.items.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <p className="titulo text-[1.75rem] mantel:italic">Tu carrito está vacío</p>
            <p className="mt-2 text-tinta-suave">Elegí algo del menú y aparece acá.</p>
            <Link href={`/${negocio.slug}`} className="presionable mt-6 inline-flex h-12 items-center rounded-full bg-acento px-6 font-semibold text-sobre-acento mantel:rounded-tarjeta">
              Ver menú
            </Link>
          </div>
        ) : (
          <>
            {(preciosCambiaron || noDisponibles.length > 0) && (
              <div role="alert" className="mb-5 rounded-tarjeta border border-amber-500/40 bg-amber-500/10 px-4 py-3.5 text-[15px] text-tinta">
                <p className="font-semibold">El menú cambió desde que armaste el pedido.</p>
                <p className="mt-1 text-tinta-suave">
                  {noDisponibles.length > 0 && "Quitá los productos marcados para seguir. "}
                  {preciosCambiaron && "Algunos precios cambiaron: ya ves los nuevos."}
                </p>
                {preciosCambiaron && (
                  <button
                    type="button"
                    onClick={() => guardar((c) => aceptarPreciosActuales(c, resumen.lineas, negocio.menuVersion))}
                    className="presionable mt-3 h-11 rounded-full bg-tinta px-4 font-semibold text-lienzo"
                  >
                    Aceptar precios nuevos
                  </button>
                )}
              </div>
            )}

            <ul className="overflow-hidden rounded-tarjeta border border-linea bg-superficie">
              {resumen.lineas.map((linea, i) => {
                const { item } = linea;
                const nombre = linea.producto?.name ?? "Producto";
                return (
                  <li key={item.key} className={`p-4 transition-colors ${i ? "border-t border-linea" : ""}`}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[16px] font-semibold">{nombre}</p>
                        {linea.estado === "ok" && linea.detalle && <p className="mt-0.5 text-[14px] leading-snug text-tinta-suave">{linea.detalle}</p>}
                        {item.note && <p className="mt-1 text-[14px] italic text-tinta-suave">“{item.note}”</p>}
                        {linea.estado === "no_disponible" && <p className="mt-1 text-[14px] font-medium text-red-700 nocturno:text-red-400">{linea.motivo}</p>}
                        {linea.estado === "ok" && linea.precioCambio && (
                          <p className="mt-1 text-[14px] text-amber-700 nocturno:text-amber-400">
                            Antes {formatearPesos(item.unitCents)}, ahora {formatearPesos(linea.unitCents)} c/u
                          </p>
                        )}
                      </div>
                      {linea.estado === "ok" && <p className="text-[16px] font-semibold tabular-nums">{formatearPesos(linea.lineCents)}</p>}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      {linea.estado === "ok" && (
                        <>
                          <div className="flex items-center rounded-full border border-linea mantel:rounded-tarjeta">
                            <button
                              type="button"
                              onClick={() => guardar((c) => cambiarCantidad(c, item.key, item.quantity - 1))}
                              aria-label={`Restar uno de ${nombre}`}
                              className="presionable grid size-11 place-items-center rounded-full"
                            >
                              <Minus className="size-4" aria-hidden />
                            </button>
                            <span className="w-6 text-center font-semibold tabular-nums">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => guardar((c) => cambiarCantidad(c, item.key, item.quantity + 1))}
                              disabled={item.quantity >= LIMITES_PEDIDO.maxQuantity}
                              aria-label={`Sumar uno de ${nombre}`}
                              className="presionable grid size-11 place-items-center rounded-full disabled:text-tinta/25"
                            >
                              <Plus className="size-4" aria-hidden />
                            </button>
                          </div>
                          {linea.producto.groups.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setEditando({ producto: linea.producto, item })}
                              className="presionable h-11 rounded-full px-4 text-[15px] font-medium text-tinta underline decoration-linea underline-offset-4 hover:decoration-tinta"
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
                        className="presionable ml-auto grid size-11 place-items-center rounded-full text-tinta-suave hover:bg-realce hover:text-tinta"
                      >
                        <Trash2 className="size-[1.15rem]" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <dl className="mt-5 space-y-2 px-1 text-[15px]">
              <div className="flex justify-between">
                <dt className="text-tinta-suave">Subtotal</dt>
                <dd className="font-semibold tabular-nums">{formatearPesos(resumen.subtotalCents)}</dd>
              </div>
              {negocio.deliveryEnabled && (
                <div className="flex justify-between">
                  <dt className="text-tinta-suave">Envío (si elegís delivery)</dt>
                  <dd className="tabular-nums">{negocio.deliveryFeeCents ? formatearPesos(negocio.deliveryFeeCents) : "Gratis"}</dd>
                </div>
              )}
            </dl>

            {negocio.minOrderCents > 0 && (
              <div className="mt-5 rounded-tarjeta border border-linea bg-superficie px-4 py-3.5">
                <div className="flex items-baseline justify-between text-[14px]">
                  <span className="font-medium">
                    {resumen.faltanteMinimoCents > 0 ? `Te faltan ${formatearPesos(resumen.faltanteMinimoCents)}` : "Llegaste al mínimo"}
                  </span>
                  <span className="tabular-nums text-tinta-suave">Mínimo {formatearPesos(negocio.minOrderCents)}</span>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-realce" aria-hidden>
                  <div style={{ transform: `scaleX(${avanceMinimo})` }} className="h-full origin-left rounded-full bg-acento transition-transform duration-500 ease-salida" />
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {carrito.items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-linea bg-lienzo/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          <div className="mx-auto max-w-2xl">
            {apertura?.abierto && !resumen.hayProblemas && resumen.faltanteMinimoCents === 0 ? (
              <Link href={`/${negocio.slug}/confirmar`} className={BOTON_PRINCIPAL}>
                <span>Continuar</span>
                <span className="tabular-nums">{formatearPesos(resumen.subtotalCents)}</span>
              </Link>
            ) : (
              <>
                <button type="button" disabled className={BOTON_PRINCIPAL}>
                  <span>Continuar</span>
                  <span className="tabular-nums">{formatearPesos(resumen.subtotalCents)}</span>
                </button>
                <p className="mt-2 text-center text-[14px] text-tinta-suave">
                  {apertura && !apertura.abierto
                    ? "Ahora no estamos tomando pedidos."
                    : resumen.hayProblemas
                      ? "Resolvé los cambios del menú para seguir."
                      : resumen.faltanteMinimoCents > 0
                        ? "Sumá algo más para llegar al pedido mínimo."
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
    </MarcoMenu>
  );
}
