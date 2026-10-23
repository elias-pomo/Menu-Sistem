"use client";

import { MapPin, Plus, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { textoSobre } from "@/lib/color";
import { formatearPesos } from "@/lib/dinero";
import type { MenuPublico, ProductoPublico } from "@/modulos/menu/tipos";
import { agregarItem, evaluarCarrito } from "./carrito";
import { EstadoApertura, useApertura } from "./estado-apertura";
import { HojaProducto } from "./hoja-producto";
import { useCarrito } from "./use-carrito";

/** Variables de color del negocio, con el texto sobre el color principal calculado por contraste. */
export function estiloNegocio(color: string): CSSProperties {
  return { "--primary": color, "--primary-foreground": textoSobre(color) } as CSSProperties;
}

/** "Desde" si alguna opción suma al precio base. */
function tieneAdicionales(producto: ProductoPublico) {
  return producto.groups.some((g) => g.kind === "CHOICE" && g.options.some((o) => o.priceDeltaCents > 0));
}

/** Página del menú (RF-001 a RF-003): categorías, productos y barra del carrito. */
export function MenuNegocio({ menu }: { menu: MenuPublico }) {
  const { business: negocio } = menu;
  const [carrito, guardar] = useCarrito(negocio.slug);
  const [abierto, setAbierto] = useState<ProductoPublico | null>(null);
  const [aviso, setAviso] = useState("");
  const apertura = useApertura(negocio);
  // Mientras no se sabe la hora (servidor y primera hidratación), el menú se muestra en lectura.
  const aceptaPedidos = apertura?.abierto === true;
  const resumen = evaluarCarrito(menu, carrito);

  function agregarDirecto(producto: ProductoPublico) {
    guardar((c) => agregarItem(c, { productId: producto.id, quantity: 1, optionIds: [], note: null, unitCents: producto.priceCents }, negocio.menuVersion));
    setAviso(`${producto.name} agregado al carrito`);
  }

  return (
    <div style={estiloNegocio(negocio.primaryColor)} className="min-h-dvh pb-28">
      <header className="mx-auto max-w-2xl px-4 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          {negocio.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo subido por el negocio, sin dominio fijo
            <img src={negocio.logoUrl} alt="" className="size-14 rounded-2xl object-cover" />
          ) : (
            <div aria-hidden className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--primary)] text-2xl font-bold text-[var(--primary-foreground)]">
              {negocio.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">{negocio.name}</h1>
            {negocio.address && (
              <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
                <MapPin className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{negocio.address}</span>
              </p>
            )}
          </div>
        </div>
        <div className="mt-3">
          <EstadoApertura negocio={negocio} />
        </div>
        {apertura && !apertura.abierto && (
          <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {apertura.motivo === "PAUSADO" && negocio.pauseMessage
              ? negocio.pauseMessage
              : "Ahora no estamos tomando pedidos. Podés mirar el menú."}
          </p>
        )}
      </header>

      {menu.categories.length > 1 && (
        <nav aria-label="Categorías" className="sticky top-0 z-10 border-b border-stone-200 bg-background/95 backdrop-blur">
          <ul className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
            {menu.categories.map((c) => (
              <li key={c.id} className="shrink-0">
                <a href={`#cat-${c.id}`} className="inline-flex h-11 items-center rounded-full border border-stone-200 bg-white px-4 text-sm font-medium hover:border-[var(--primary)]">
                  {c.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <main className="mx-auto max-w-2xl px-4">
        {menu.categories.length === 0 && <p className="py-16 text-center text-muted">El menú se está cargando. Volvé en un rato.</p>}
        {menu.categories.map((categoria) => (
          <section key={categoria.id} id={`cat-${categoria.id}`} className="scroll-mt-16 pt-6" aria-labelledby={`titulo-${categoria.id}`}>
            <h2 id={`titulo-${categoria.id}`} className="mb-3 text-lg font-bold">
              {categoria.name}
            </h2>
            <ul className="flex flex-col gap-3">
              {categoria.products.map((producto) => (
                <li key={producto.id}>
                  <TarjetaProducto
                    producto={producto}
                    aceptaPedidos={aceptaPedidos}
                    onElegir={() => (producto.groups.length ? setAbierto(producto) : agregarDirecto(producto))}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      <p className="sr-only" aria-live="polite">
        {aviso}
      </p>

      {resumen.unidades > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Link
            href={`/${negocio.slug}/carrito`}
            className="mx-auto flex h-14 max-w-2xl items-center gap-3 rounded-full bg-[var(--primary)] px-5 font-semibold text-[var(--primary-foreground)] shadow-lg"
          >
            <ShoppingBag className="size-5" aria-hidden />
            <span className="flex-1">
              Ver carrito · {resumen.unidades} {resumen.unidades === 1 ? "producto" : "productos"}
            </span>
            <span className="tabular-nums">{formatearPesos(resumen.subtotalCents)}</span>
          </Link>
        </div>
      )}

      <HojaProducto
        menu={menu}
        producto={abierto}
        onCerrar={() => setAbierto(null)}
        onConfirmar={(item) => {
          guardar((c) => agregarItem(c, item, negocio.menuVersion));
          setAviso(`${abierto?.name ?? "Producto"} agregado al carrito`);
        }}
      />
    </div>
  );
}

function TarjetaProducto({ producto, aceptaPedidos, onElegir }: { producto: ProductoPublico; aceptaPedidos: boolean; onElegir: () => void }) {
  const pedible = aceptaPedidos && !producto.isSoldOut;
  const contenido = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{producto.name}</h3>
          {producto.tags.map((t) => (
            <span key={t} className="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--primary)]">
              {t}
            </span>
          ))}
        </div>
        {producto.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{producto.description}</p>}
        <p className="mt-2 font-semibold tabular-nums">
          {tieneAdicionales(producto) && <span className="font-normal text-muted">Desde </span>}
          {formatearPesos(producto.priceCents)}
        </p>
      </div>
      {producto.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- fotos ya optimizadas al subir (WebP, ≤ 1600 px)
        <img src={producto.imageUrl} alt="" loading="lazy" className="size-24 shrink-0 rounded-2xl object-cover" />
      )}
      {producto.isSoldOut ? (
        <span className="self-center rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-600">Agotado</span>
      ) : (
        pedible && (
          <span aria-hidden className="grid size-11 shrink-0 place-items-center self-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
            <Plus className="size-5" />
          </span>
        )
      )}
    </>
  );

  if (!pedible) {
    return <div className={`flex gap-3 rounded-2xl border border-stone-200 bg-white p-4 ${producto.isSoldOut ? "opacity-60" : ""}`}>{contenido}</div>;
  }
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-label={`Agregar ${producto.name}`}
      className="flex w-full gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left transition-colors hover:border-[var(--primary)] active:bg-stone-50"
    >
      {contenido}
    </button>
  );
}
