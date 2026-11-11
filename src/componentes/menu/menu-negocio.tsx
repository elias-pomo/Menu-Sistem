"use client";

import { Bike, Check, MapPin, Plus, Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatearPesos } from "@/lib/dinero";
import type { EstiloMenu } from "@/modulos/menu/estilos";
import type { CategoriaPublica, MenuPublico, NegocioPublico, ProductoPublico } from "@/modulos/menu/tipos";
import { agregarItem, evaluarCarrito } from "./carrito";
import { EstadoApertura, useApertura } from "./estado-apertura";
import { HojaProducto } from "./hoja-producto";
import { MarcoMenu } from "./marco";
import { NavCategorias } from "./nav-categorias";
import { useCarrito } from "./use-carrito";

/** "Desde" si alguna opción suma al precio base. */
function tieneAdicionales(producto: ProductoPublico) {
  return producto.groups.some((g) => g.kind === "CHOICE" && g.options.some((o) => o.priceDeltaCents > 0));
}

/** Página del menú (RF-001 a RF-003): encabezado, categorías, productos y barra del carrito. */
export function MenuNegocio({ menu }: { menu: MenuPublico }) {
  const { business: negocio } = menu;
  const estilo = negocio.menuStyle;
  const [carrito, guardar] = useCarrito(negocio.slug);
  const [abierto, setAbierto] = useState<ProductoPublico | null>(null);
  const [aviso, setAviso] = useState("");
  const [recien, setRecien] = useState<string | null>(null);
  const temporizador = useRef<number | undefined>(undefined);
  const apertura = useApertura(negocio);
  // Mientras no se sabe la hora (servidor y primera hidratación), el menú se muestra en lectura.
  const aceptaPedidos = apertura?.abierto === true;
  const resumen = evaluarCarrito(menu, carrito);

  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  /** El "+" pasa a tilde un momento: confirma el toque sin abrir nada. */
  function marcarAgregado(producto: ProductoPublico) {
    setAviso(`${producto.name} agregado al carrito`);
    setRecien(producto.id);
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setRecien(null), 1100);
  }

  function agregarDirecto(producto: ProductoPublico) {
    guardar((c) => agregarItem(c, { productId: producto.id, quantity: 1, optionIds: [], note: null, unitCents: producto.priceCents }, negocio.menuVersion));
    marcarAgregado(producto);
  }

  return (
    <MarcoMenu estilo={estilo} color={negocio.primaryColor} className="pb-32">
      <Encabezado negocio={negocio} />

      {apertura && !apertura.abierto && (
        <div className="mx-auto max-w-2xl px-5 pb-5">
          <p className="rounded-tarjeta border border-linea bg-superficie px-4 py-3 text-[15px] text-tinta mantel:text-center">
            {apertura.motivo === "PAUSADO" && negocio.pauseMessage ? negocio.pauseMessage : "Ahora no estamos tomando pedidos. Podés mirar el menú."}
          </p>
        </div>
      )}

      {menu.categories.length > 1 && <NavCategorias categorias={menu.categories} estilo={estilo} />}

      <main className="mx-auto max-w-2xl px-5">
        {menu.categories.length === 0 && <p className="py-16 text-center text-tinta-suave">El menú se está cargando. Volvé en un rato.</p>}
        {menu.categories.map((categoria, indice) => (
          <Seccion key={categoria.id} categoria={categoria} indice={indice} estilo={estilo}>
            {categoria.products.map((producto) => (
              <TarjetaProducto
                key={producto.id}
                producto={producto}
                estilo={estilo}
                aceptaPedidos={aceptaPedidos}
                recien={recien === producto.id}
                onElegir={() => (producto.groups.length ? setAbierto(producto) : agregarDirecto(producto))}
              />
            ))}
          </Seccion>
        ))}
      </main>

      <p className="sr-only" aria-live="polite">
        {aviso}
      </p>

      {resumen.unidades > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Link
            href={`/${negocio.slug}/carrito`}
            className="presionable pointer-events-auto mx-auto flex h-16 max-w-xl items-center gap-3 rounded-full bg-acento pl-2.5 pr-6 text-sobre-acento shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)] transition-[transform,opacity] duration-500 ease-hoja mantel:rounded-tarjeta starting:translate-y-[120%] starting:opacity-0"
          >
            <span
              key={resumen.unidades}
              className="grid size-11 place-items-center rounded-full bg-sobre-acento/15 text-[15px] font-semibold tabular-nums motion-safe:animate-[latido_320ms_var(--ease-salida)] mantel:rounded-[0.25rem]"
            >
              {resumen.unidades}
            </span>
            <span className="flex flex-1 flex-col leading-tight">
              <span className="font-semibold">Ver carrito</span>
              <span className="text-[13px] opacity-80">
                {resumen.unidades} {resumen.unidades === 1 ? "producto" : "productos"}
              </span>
            </span>
            <span className="text-[17px] font-semibold tabular-nums">{formatearPesos(resumen.subtotalCents)}</span>
          </Link>
        </div>
      )}

      <HojaProducto
        menu={menu}
        producto={abierto}
        onCerrar={() => setAbierto(null)}
        onConfirmar={(item) => {
          guardar((c) => agregarItem(c, item, negocio.menuVersion));
          if (abierto) marcarAgregado(abierto);
        }}
      />
    </MarcoMenu>
  );
}

function Encabezado({ negocio }: { negocio: NegocioPublico }) {
  const estilo = negocio.menuStyle;
  const entrega = negocio.deliveryEnabled
    ? `${negocio.deliveryFeeCents ? `Envío ${formatearPesos(negocio.deliveryFeeCents)}` : "Envío gratis"}${negocio.minOrderCents ? ` · Mínimo ${formatearPesos(negocio.minOrderCents)}` : ""}`
    : `Solo retiro en el local${negocio.minOrderCents ? ` · Mínimo ${formatearPesos(negocio.minOrderCents)}` : ""}`;

  return (
    <header className="mx-auto max-w-2xl px-5 pb-7 pt-[max(2.25rem,env(safe-area-inset-top))] mantel:pt-[max(3rem,env(safe-area-inset-top))] mantel:text-center">
      <div className="flex items-end gap-4 mantel:flex-col mantel:items-center mantel:gap-5">
        {negocio.logoUrl ? (
          <Image
            src={negocio.logoUrl}
            alt=""
            width={64}
            height={64}
            preload
            className="size-16 shrink-0 rounded-tarjeta object-cover ring-1 ring-linea mostrador:rounded-full"
          />
        ) : (
          estilo !== "MANTEL" && (
            <span
              aria-hidden
              className="titulo grid size-16 shrink-0 place-items-center rounded-tarjeta bg-acento text-[2rem] text-sobre-acento mostrador:rounded-full"
            >
              {negocio.name.charAt(0)}
            </span>
          )
        )}
        <h1 className="titulo min-w-0 text-[2.5rem] nocturno:text-[3.25rem] mantel:text-[2.75rem] mantel:italic mostrador:text-[2.35rem]">{negocio.name}</h1>
      </div>

      {estilo === "MANTEL" && (
        <div aria-hidden className="mx-auto mt-5 flex w-40 items-center gap-3 text-tinta-suave">
          <span className="h-px flex-1 bg-linea" />
          <span className="size-1.5 rotate-45 bg-current" />
          <span className="h-px flex-1 bg-linea" />
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2 text-[15px] text-tinta-suave mantel:items-center">
        <EstadoApertura negocio={negocio} />
        <span className="inline-flex items-center gap-2">
          {negocio.deliveryEnabled ? <Bike className="size-4 shrink-0" aria-hidden /> : <Store className="size-4 shrink-0" aria-hidden />}
          {entrega}
        </span>
        {negocio.address && (
          <span className="inline-flex items-center gap-2">
            <MapPin className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{negocio.address}</span>
          </span>
        )}
      </div>
    </header>
  );
}

function Seccion({ categoria, indice, estilo, children }: { categoria: CategoriaPublica; indice: number; estilo: EstiloMenu; children: React.ReactNode }) {
  const lista = {
    NOCTURNO: "flex flex-col divide-y divide-linea border-y border-linea",
    MANTEL: "flex flex-col gap-1",
    MOSTRADOR: "grid grid-cols-2 gap-3 sm:grid-cols-3",
  }[estilo];

  return (
    <section
      id={`cat-${categoria.id}`}
      aria-labelledby={`titulo-${categoria.id}`}
      // Las primeras secciones entran escalonadas; las de abajo ya están cuando se llega.
      style={{ animationDelay: `${Math.min(indice, 4) * 60}ms` }}
      className="scroll-mt-20 pt-10 motion-safe:animate-[entrar-suave_520ms_var(--ease-salida)_both] first:pt-6"
    >
      {estilo === "MANTEL" ? (
        <div className="mb-5 flex items-center gap-4">
          <span aria-hidden className="h-px flex-1 bg-linea" />
          <h2 id={`titulo-${categoria.id}`} className="titulo text-center text-[1.75rem] italic">
            {categoria.name}
          </h2>
          <span aria-hidden className="h-px flex-1 bg-linea" />
        </div>
      ) : (
        <div className="mb-4 flex items-baseline gap-3">
          {estilo === "NOCTURNO" && (
            <span aria-hidden className="text-[13px] font-semibold tabular-nums tracking-[0.12em] text-tinta-suave">
              {String(indice + 1).padStart(2, "0")}
            </span>
          )}
          <h2 id={`titulo-${categoria.id}`} className="titulo text-[1.75rem] nocturno:text-[2.25rem]">
            {categoria.name}
          </h2>
          <span className="ml-auto text-[13px] tabular-nums text-tinta-suave">{categoria.products.length}</span>
        </div>
      )}
      <ul className={lista}>{children}</ul>
    </section>
  );
}

function Etiquetas({ tags, estilo }: { tags: string[]; estilo: EstiloMenu }) {
  if (!tags.length) return null;
  const clase = {
    NOCTURNO: "rounded-sm border border-linea px-1.5 py-px text-[11px] font-semibold uppercase tracking-[0.08em] text-tinta-suave",
    MANTEL: "text-[13px] italic text-tinta-suave",
    MOSTRADOR: "rounded-full bg-realce px-2 py-0.5 text-[12px] font-medium text-tinta",
  }[estilo];
  return (
    <span className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span key={t} className={clase}>
          {t}
        </span>
      ))}
    </span>
  );
}

function TarjetaProducto({
  producto,
  estilo,
  aceptaPedidos,
  recien,
  onElegir,
}: {
  producto: ProductoPublico;
  estilo: EstiloMenu;
  aceptaPedidos: boolean;
  recien: boolean;
  onElegir: () => void;
}) {
  const pedible = aceptaPedidos && !producto.isSoldOut;
  const precio = (
    <span className={`tabular-nums ${producto.isSoldOut ? "text-tinta-suave line-through decoration-1" : "text-tinta"}`}>
      {tieneAdicionales(producto) && <span className="text-tinta-suave">desde </span>}
      {formatearPesos(producto.priceCents)}
    </span>
  );
  const agotado = (
    <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-tinta-suave nocturno:text-[11px] mantel:normal-case mantel:italic mantel:tracking-normal">
      Agotado
    </span>
  );
  const foto = producto.imageUrl && (
    // Vercel la achica al tamaño en pantalla: la foto original puede tener hasta 1600 px.
    <Image
      src={producto.imageUrl}
      alt=""
      width={estilo === "MOSTRADOR" ? 240 : 88}
      height={estilo === "MOSTRADOR" ? 240 : 88}
      className={
        estilo === "MOSTRADOR"
          ? "aspect-square w-full rounded-[calc(var(--m-radio)-0.375rem)] object-cover"
          : "size-[5.5rem] shrink-0 rounded-tarjeta object-cover"
      }
    />
  );
  // El botón es el "+", pero su área cubre toda la tarjeta (after:inset-0): el nombre accesible queda
  // corto ("Agregar X") y el texto de la tarjeta se sigue leyendo como texto.
  const boton = pedible && (
    <button
      type="button"
      onClick={onElegir}
      aria-label={`Agregar ${producto.name}`}
      className={`relative grid size-11 shrink-0 place-items-center transition-colors after:absolute after:-inset-[999px] after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento ${
        estilo === "MANTEL" ? "rounded-full border border-linea bg-superficie text-tinta" : estilo === "NOCTURNO" ? "rounded-[0.6rem] bg-acento text-sobre-acento" : "rounded-full bg-acento text-sobre-acento"
      }`}
    >
      <Plus aria-hidden strokeWidth={2.25} className={`absolute size-5 transition-[transform,opacity,filter] duration-200 ease-salida ${recien ? "scale-50 opacity-0 blur-[2px]" : ""}`} />
      <Check aria-hidden strokeWidth={2.5} className={`absolute size-5 transition-[transform,opacity,filter] duration-200 ease-salida ${recien ? "" : "scale-50 opacity-0 blur-[2px]"}`} />
    </button>
  );

  // Contenedor común: recorta el área del botón y responde al toque como una sola pieza.
  const tarjeta = `relative overflow-hidden transition-[transform,background-color] duration-150 ease-salida ${pedible ? "has-[button:active]:scale-[0.985]" : ""}`;

  if (estilo === "MOSTRADOR") {
    return (
      <li className={`${tarjeta} flex flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-3 pb-3.5 ${pedible ? "hover:border-tinta/25" : ""}`}>
        {foto}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-0.5">
          <h3 className="text-[15px] font-semibold leading-snug text-tinta">{producto.name}</h3>
          <Etiquetas tags={producto.tags} estilo={estilo} />
          {producto.description && <p className="line-clamp-2 text-[13px] leading-snug text-tinta-suave">{producto.description}</p>}
        </div>
        <div className="flex items-end justify-between gap-2 px-0.5">
          <span className="flex flex-col text-[15px] font-semibold leading-tight">
            {tieneAdicionales(producto) && <span className="text-[12px] font-medium text-tinta-suave">desde</span>}
            <span className={`tabular-nums ${producto.isSoldOut ? "text-tinta-suave line-through decoration-1" : ""}`}>{formatearPesos(producto.priceCents)}</span>
          </span>
          {producto.isSoldOut ? agotado : boton}
        </div>
      </li>
    );
  }

  if (estilo === "MANTEL") {
    return (
      <li className={`${tarjeta} -mx-3 flex items-center gap-4 rounded-tarjeta px-3 py-3.5 ${pedible ? "hover:bg-realce/70" : ""}`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline">
            <h3 className="titulo text-[1.3rem]">{producto.name}</h3>
            <span aria-hidden className="guia" />
            <span className="text-[16px] font-medium">{precio}</span>
          </div>
          {producto.description && <p className="mt-1 text-[15px] leading-relaxed text-tinta-suave">{producto.description}</p>}
          <div className="mt-1 flex items-center gap-3 empty:hidden">
            <Etiquetas tags={producto.tags} estilo={estilo} />
            {producto.isSoldOut && agotado}
          </div>
        </div>
        {foto}
        {boton}
      </li>
    );
  }

  return (
    <li className={`${tarjeta} -mx-5 flex items-center gap-4 px-5 py-5 ${pedible ? "hover:bg-superficie" : ""}`}>
      {foto}
      <div className="min-w-0 flex-1">
        <h3 className="titulo text-[1.5rem] leading-none">{producto.name}</h3>
        {producto.description && <p className="mt-1.5 text-[15px] leading-snug text-tinta-suave">{producto.description}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[16px] font-semibold">{precio}</span>
          <Etiquetas tags={producto.tags} estilo={estilo} />
          {producto.isSoldOut && agotado}
        </div>
      </div>
      {boton}
    </li>
  );
}
