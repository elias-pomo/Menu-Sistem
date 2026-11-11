"use client";

import { Bike, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useHidratado } from "@/componentes/use-hidratado";
import { formatearPesos, pesosACentavos } from "@/lib/dinero";
import type { MenuPublico } from "@/modulos/menu/tipos";
import type { CambioMenu } from "@/modulos/pedidos/calculo";
import { evaluarCarrito, quitarItem, type Carrito } from "./carrito";
import { guardarDatosCliente, leerDatosCliente, type DatosCliente } from "./datos-cliente";
import { useApertura } from "./estado-apertura";
import { BarraSuperior, BOTON_PRINCIPAL } from "./carrito-vista";
import { MarcoMenu } from "./marco";
import { useCarrito } from "./use-carrito";

const LEYENDA = "titulo text-[1.35rem] nocturno:text-[1.6rem] mantel:italic";

/** Fila de medio de pago con indicador propio (el radio nativo queda para lectores y teclado). */
function OpcionPago({ marcada, onElegir, titulo, detalle }: { marcada: boolean; onElegir: () => void; titulo: string; detalle: string }) {
  return (
    <label className="flex min-h-16 cursor-pointer items-center gap-3.5 px-4 py-2 transition-colors duration-150 active:bg-realce [&+&]:border-t [&+&]:border-linea">
      <input type="radio" name="pago" checked={marcada} onChange={onElegir} className="peer sr-only" />
      <span
        aria-hidden
        className={`grid size-[1.375rem] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-acento ${
          marcada ? "border-acento bg-acento" : "border-tinta/30"
        }`}
      >
        <span className={`size-2 rounded-full bg-sobre-acento transition-[transform,opacity] duration-200 ease-salida ${marcada ? "" : "scale-0 opacity-0"}`} />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[16px] font-medium">{titulo}</span>
        <span className="text-[13px] text-tinta-suave">{detalle}</span>
      </span>
    </label>
  );
}

type ErrorApi = { code: string; message: string; fields?: Record<string, string>; details?: unknown[] };

/** Datos del pedido y confirmación (RF-009 a RF-016). */
export function FormularioPedido({ menu }: { menu: MenuPublico }) {
  const hidratado = useHidratado();
  // El formulario se arma recién en el navegador: lee los datos recordados y el carrito guardado.
  return (
    <MarcoMenu estilo={menu.business.menuStyle} color={menu.business.primaryColor}>
      {hidratado ? <Formulario menu={menu} /> : <Cargando />}
    </MarcoMenu>
  );
}

function Cargando() {
  return <div className="mx-auto h-96 max-w-2xl px-5 pt-6" aria-busy="true" />;
}

function Formulario({ menu }: { menu: MenuPublico }) {
  const { business: negocio } = menu;
  const router = useRouter();
  const [carrito, guardar] = useCarrito(negocio.slug);
  const apertura = useApertura(negocio);
  const [datos, setDatos] = useState<DatosCliente>(leerDatosCliente);
  const [entrega, setEntrega] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [pago, setPago] = useState<"CASH" | "TRANSFER">(negocio.acceptCash ? "CASH" : "TRANSFER");
  const [pagoCon, setPagoCon] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [cambios, setCambios] = useState<CambioMenu[] | null>(null);
  // Un id por intento de envío: el doble toque o un reintento no crean dos pedidos (RF-014).
  const solicitud = useRef(crypto.randomUUID());

  const resumen = evaluarCarrito(menu, carrito);
  const envio = entrega === "DELIVERY" ? negocio.deliveryFeeCents : 0;
  const total = resumen.subtotalCents + envio;
  const campos = error?.fields ?? {};
  const cambiar = (campo: keyof DatosCliente) => (e: React.ChangeEvent<HTMLInputElement>) => setDatos((d) => ({ ...d, [campo]: e.target.value }));

  if (carrito.items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="titulo text-[1.75rem] mantel:italic">Tu carrito está vacío</p>
        <Link href={`/${negocio.slug}`} className="presionable mt-6 inline-flex h-12 items-center rounded-full bg-acento px-6 font-semibold text-sobre-acento mantel:rounded-tarjeta">
          Ver menú
        </Link>
      </div>
    );
  }

  async function enviar(carritoAEnviar: Carrito) {
    setEnviando(true);
    setError(null);
    guardarDatosCliente(datos);
    const efectivo = pago === "CASH";
    const cuerpo = {
      clientRequestId: solicitud.current,
      menuVersion: carritoAEnviar.menuVersion,
      fulfillment: entrega,
      customer: { name: datos.name, phone: datos.phone },
      address:
        entrega === "DELIVERY"
          ? { street: datos.street, number: datos.number, neighborhood: datos.neighborhood, unit: datos.unit || null, reference: datos.reference || null }
          : null,
      payment: { method: pago, changeFor: efectivo && pagoCon ? pesosACentavos(pagoCon) : null },
      note: nota || null,
      items: carritoAEnviar.items.map((i) => ({ productId: i.productId, quantity: i.quantity, optionIds: i.optionIds, note: i.note, expectedUnitCents: i.unitCents })),
    };
    try {
      const respuesta = await fetch(`/api/v1/public/${negocio.slug}/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const datosRespuesta = await respuesta.json().catch(() => null);
      if (respuesta.ok) {
        guardar(() => ({ menuVersion: negocio.menuVersion, items: [] }));
        router.replace(`/${negocio.slug}/pedido/${datosRespuesta.order.token}`);
        return;
      }
      const e: ErrorApi = datosRespuesta?.error ?? { code: "INTERNAL_ERROR", message: "Ocurrió un error. Probá de nuevo." };
      // Un rechazo no creó el pedido: el próximo envío puede ir con otro id.
      solicitud.current = crypto.randomUUID();
      if (e.code === "MENU_CHANGED") setCambios((e.details ?? []) as CambioMenu[]);
      else setError(e);
    } catch {
      // Sin conexión no se sabe si llegó: se reintenta con el mismo id, así no se duplica.
      setError({ code: "NETWORK", message: "No hay conexión. Revisá tu internet y volvé a tocar Confirmar." });
    }
    setEnviando(false);
  }

  /** Acepta los cambios del 409: quita lo que ya no está y actualiza precios. */
  function aceptarCambios() {
    if (!cambios) return;
    let nuevo = carrito;
    for (const c of cambios) {
      if (c.change === "PRICE") {
        nuevo = { ...nuevo, items: nuevo.items.map((i) => (i.productId === c.productId ? { ...i, unitCents: c.newCents } : i)) };
      } else {
        for (const i of nuevo.items.filter((x) => x.productId === c.productId)) nuevo = quitarItem(nuevo, i.key);
      }
    }
    nuevo = { ...nuevo, menuVersion: negocio.menuVersion };
    guardar(() => nuevo);
    setCambios(null);
    router.refresh();
  }

  const nombreDe = (productId: string) => menu.categories.flatMap((c) => c.products).find((p) => p.id === productId)?.name ?? "Un producto";
  const campo =
    "mt-1.5 h-12 w-full rounded-tarjeta border border-linea bg-superficie px-4 text-tinta outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-tinta-suave/70 focus:border-acento focus:ring-4 focus:ring-acento/15";
  const errorDe = (clave: string) =>
    campos[clave] && (
      <p className="mt-1.5 text-[14px] text-red-700 nocturno:text-red-400" id={`error-${clave}`}>
        {campos[clave]}
      </p>
    );
  const cerrado = apertura && !apertura.abierto;

  return (
    <div className="min-h-dvh pb-40">
      <BarraSuperior volver={`/${negocio.slug}/carrito`} etiquetaVolver="Volver al carrito" titulo="Datos del pedido" local={negocio.name} />

      <form
        id="pedido"
        method="post"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!enviando) enviar(carrito);
        }}
        className="mx-auto flex max-w-2xl flex-col gap-8 px-5 pt-6"
      >
        {error && (
          <p role="alert" className="rounded-tarjeta border border-red-600/30 bg-red-600/10 px-4 py-3 text-[15px] text-tinta">
            {error.message}
          </p>
        )}

        {negocio.deliveryEnabled && (
          <fieldset>
            <legend className={LEYENDA}>¿Cómo lo recibís?</legend>
            {/* Control segmentado: el fondo claro se desliza hacia la opción elegida. */}
            <div className="relative mt-3 grid grid-cols-2 rounded-tarjeta bg-realce p-1">
              <span
                aria-hidden
                className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-[calc(var(--m-radio)-0.25rem)] bg-superficie shadow-[0_1px_3px_rgb(0_0_0/0.12)] transition-transform duration-300 ease-salida ${
                  entrega === "DELIVERY" ? "translate-x-full" : ""
                }`}
              />
              {(
                [
                  ["PICKUP", "Retiro", "En el local", Store],
                  ["DELIVERY", "Delivery", negocio.deliveryFeeCents ? `+ ${formatearPesos(negocio.deliveryFeeCents)}` : "Envío gratis", Bike],
                ] as const
              ).map(([valor, texto, detalle, Icono]) => (
                <label key={valor} className="relative flex min-h-14 cursor-pointer items-center justify-center gap-2.5 px-3 py-2 text-[15px]">
                  <input type="radio" name="entrega" value={valor} checked={entrega === valor} onChange={() => setEntrega(valor)} className="peer sr-only" />
                  <Icono className={`size-5 shrink-0 transition-colors ${entrega === valor ? "text-tinta" : "text-tinta-suave"}`} aria-hidden />
                  <span className="flex flex-col leading-tight">
                    <span className={`font-semibold transition-colors ${entrega === valor ? "text-tinta" : "text-tinta-suave"}`}>{texto}</span>
                    <span className="text-[13px] text-tinta-suave">{detalle}</span>
                  </span>
                  <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[calc(var(--m-radio)-0.25rem)] peer-focus-visible:outline-2 peer-focus-visible:outline-acento" />
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {!negocio.deliveryEnabled && negocio.address && (
          <p className="rounded-tarjeta border border-linea bg-superficie px-4 py-3 text-[15px]">
            <span className="font-semibold">Retiro en el local.</span> <span className="text-tinta-suave">{negocio.address}</span>
          </p>
        )}

        <fieldset className="flex flex-col gap-4">
          <legend className={LEYENDA}>Tus datos</legend>
          <label className="block">
            <span className="text-[14px] font-medium text-tinta">Nombre</span>
            <input value={datos.name} onChange={cambiar("name")} autoComplete="name" maxLength={80} className={campo} aria-describedby={campos["customer.name"] ? "error-customer.name" : undefined} />
            {errorDe("customer.name")}
          </label>
          <label className="block">
            <span className="text-[14px] font-medium text-tinta">Celular</span>
            <input
              value={datos.phone}
              onChange={cambiar("phone")}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="381 555 1234"
              maxLength={30}
              className={campo}
              aria-describedby={campos["customer.phone"] ? "error-customer.phone" : undefined}
            />
            {errorDe("customer.phone")}
          </label>
        </fieldset>

        {entrega === "DELIVERY" && (
          <fieldset className="grid grid-cols-3 gap-3">
            <legend className={`col-span-3 ${LEYENDA}`}>Dirección de entrega</legend>
            <label className="col-span-2 block">
              <span className="text-[14px] font-medium text-tinta">Calle</span>
              <input value={datos.street} onChange={cambiar("street")} autoComplete="address-line1" maxLength={80} className={campo} />
              {errorDe("address.street")}
            </label>
            <label className="block">
              <span className="text-[14px] font-medium text-tinta">Altura</span>
              <input value={datos.number} onChange={cambiar("number")} inputMode="numeric" maxLength={10} className={campo} />
              {errorDe("address.number")}
            </label>
            <label className="col-span-2 block">
              <span className="text-[14px] font-medium text-tinta">Barrio</span>
              <input value={datos.neighborhood} onChange={cambiar("neighborhood")} maxLength={60} className={campo} />
              {errorDe("address.neighborhood")}
            </label>
            <label className="block">
              <span className="text-[14px] font-medium text-tinta">Piso/depto</span>
              <input value={datos.unit} onChange={cambiar("unit")} maxLength={20} className={campo} />
            </label>
            <label className="col-span-3 block">
              <span className="text-[14px] font-medium text-tinta">Referencias</span>
              <span className="ml-2 text-[14px] text-tinta-suave">Opcional</span>
              <input value={datos.reference} onChange={cambiar("reference")} maxLength={120} placeholder="Portón negro, timbre 2" className={campo} />
            </label>
          </fieldset>
        )}

        <fieldset>
          <legend className={LEYENDA}>¿Cómo pagás?</legend>
          <div className="mt-3 overflow-hidden rounded-tarjeta border border-linea bg-superficie">
            {negocio.acceptCash && (
              <OpcionPago marcada={pago === "CASH"} onElegir={() => setPago("CASH")} titulo="Efectivo" detalle="Pagás al recibir o al retirar" />
            )}
            {negocio.acceptTransfer && (
              <OpcionPago marcada={pago === "TRANSFER"} onElegir={() => setPago("TRANSFER")} titulo="Transferencia" detalle="Te mostramos el alias al confirmar" />
            )}
          </div>
          {pago === "CASH" && (
            <label className="mt-3 block">
              <span className="text-[14px] font-medium text-tinta">¿Con cuánto pagás?</span>
              <span className="ml-2 text-[14px] text-tinta-suave">Opcional, para llevarte el cambio</span>
              <input value={pagoCon} onChange={(e) => setPagoCon(e.target.value)} inputMode="decimal" placeholder={String(Math.ceil(total / 100))} className={campo} />
              {errorDe("payment.changeFor")}
            </label>
          )}
          {pago === "TRANSFER" && negocio.acceptTransfer && (
            <p className="mt-3 text-[14px] text-tinta-suave">El local verifica el pago cuando le llega la transferencia.</p>
          )}
        </fieldset>

        <label className="block">
          <span className={LEYENDA}>Aclaraciones para el local</span>
          <span className="ml-2 text-[14px] text-tinta-suave">Opcional</span>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} rows={2} className={`${campo} h-auto resize-none py-3`} />
          {errorDe("note")}
        </label>

        <dl className="space-y-2 rounded-tarjeta border border-linea bg-superficie p-4 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-tinta-suave">
              {resumen.unidades} {resumen.unidades === 1 ? "producto" : "productos"}
            </dt>
            <dd className="tabular-nums">{formatearPesos(resumen.subtotalCents)}</dd>
          </div>
          {entrega === "DELIVERY" && (
            <div className="flex justify-between">
              <dt className="text-tinta-suave">Envío</dt>
              <dd className="tabular-nums">{envio ? formatearPesos(envio) : "Gratis"}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-linea pt-3 text-[17px] font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatearPesos(total)}</dd>
          </div>
        </dl>

        <p className="text-[13px] leading-relaxed text-tinta-suave">
          Tus datos (nombre, celular{entrega === "DELIVERY" ? " y dirección" : ""}) se usan solo para que {negocio.name} prepare y entregue tu pedido. Los recibe el local.
        </p>
      </form>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-linea bg-lienzo/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl">
          <button
            type="submit"
            form="pedido"
            disabled={enviando || !!cerrado || resumen.hayProblemas || resumen.faltanteMinimoCents > 0}
            className={BOTON_PRINCIPAL}
          >
            <span>{enviando ? "Enviando…" : "Confirmar pedido"}</span>
            <span className="tabular-nums">{formatearPesos(total)}</span>
          </button>
          {cerrado && <p className="mt-2 text-center text-[14px] text-tinta-suave">Ahora no estamos tomando pedidos.</p>}
          {!cerrado && resumen.hayProblemas && <p className="mt-2 text-center text-[14px] text-tinta-suave">Revisá tu carrito: algo cambió en el menú.</p>}
        </div>
      </div>

      {cambios && (
        <div role="dialog" aria-modal="true" aria-labelledby="cambios-titulo" className="fixed inset-0 z-30 grid place-items-end bg-black/45 transition-opacity duration-300 starting:opacity-0 sm:place-items-center">
          <div className="w-full max-w-lg rounded-t-[1.75rem] bg-superficie p-6 transition-transform duration-[420ms] ease-hoja starting:translate-y-full mantel:rounded-t-xl sm:rounded-[1.75rem]">
            <h2 id="cambios-titulo" className="titulo text-[1.6rem] mantel:italic">
              Algunos productos cambiaron
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-[15px]">
              {cambios.map((c, i) => (
                <li key={i} className="rounded-tarjeta bg-realce px-3.5 py-2.5">
                  <span className="font-medium">{nombreDe(c.productId)}</span>:{" "}
                  {c.change === "PRICE"
                    ? `antes ${formatearPesos(c.oldCents)}, ahora ${formatearPesos(c.newCents)} c/u`
                    : c.change === "SOLD_OUT"
                      ? "se agotó, lo sacamos del pedido"
                      : c.change === "OPTION_UNAVAILABLE"
                        ? "una opción ya no está, lo sacamos del pedido"
                        : "ya no está en el menú, lo sacamos del pedido"}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={aceptarCambios} className="presionable h-12 rounded-full bg-acento font-semibold text-sobre-acento mantel:rounded-tarjeta">
                Aceptar cambios
              </button>
              <Link href={`/${negocio.slug}/carrito`} className="presionable grid h-12 place-items-center rounded-full border border-linea font-medium mantel:rounded-tarjeta">
                Volver al carrito
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
