"use client";

import { ArrowLeft, Bike, Store } from "lucide-react";
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
import { estiloNegocio } from "./menu-negocio";
import { useCarrito } from "./use-carrito";

type ErrorApi = { code: string; message: string; fields?: Record<string, string>; details?: unknown[] };

/** Datos del pedido y confirmación (RF-009 a RF-016). */
export function FormularioPedido({ menu }: { menu: MenuPublico }) {
  const hidratado = useHidratado();
  // El formulario se arma recién en el navegador: lee los datos recordados y el carrito guardado.
  return <div style={estiloNegocio(menu.business.primaryColor)}>{hidratado ? <Formulario menu={menu} /> : <Cargando />}</div>;
}

function Cargando() {
  return <div className="mx-auto h-96 max-w-2xl animate-pulse px-4 pt-6" aria-busy="true" />;
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
        <p className="text-lg font-semibold">Tu carrito está vacío</p>
        <Link href={`/${negocio.slug}`} className="mt-4 inline-flex h-12 items-center rounded-full bg-[var(--primary)] px-6 font-semibold text-[var(--primary-foreground)]">
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
  const campo = "mt-1 h-12 w-full rounded-xl border border-stone-300 bg-white px-4 outline-none focus:border-[var(--primary)]";
  const errorDe = (clave: string) =>
    campos[clave] && (
      <p className="mt-1 text-sm text-red-700" id={`error-${clave}`}>
        {campos[clave]}
      </p>
    );
  const cerrado = apertura && !apertura.abierto;

  return (
    <div className="min-h-dvh pb-36">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-2 py-2">
          <Link href={`/${negocio.slug}/carrito`} aria-label="Volver al carrito" className="grid size-11 place-items-center rounded-full hover:bg-stone-100">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <h1 className="text-lg font-bold">Datos del pedido</h1>
        </div>
      </header>

      <form
        id="pedido"
        method="post"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!enviando) enviar(carrito);
        }}
        className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-5"
      >
        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {error.message}
          </p>
        )}

        {negocio.deliveryEnabled && (
          <fieldset>
            <legend className="font-semibold">¿Cómo lo recibís?</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  ["PICKUP", "Retiro en el local", Store],
                  ["DELIVERY", `Delivery${negocio.deliveryFeeCents ? ` (+${formatearPesos(negocio.deliveryFeeCents)})` : ""}`, Bike],
                ] as const
              ).map(([valor, texto, Icono]) => (
                <label
                  key={valor}
                  className={`flex min-h-14 cursor-pointer items-center gap-2 rounded-2xl border-2 px-3 py-2 text-sm font-medium ${entrega === valor ? "border-[var(--primary)] bg-white" : "border-stone-200 bg-white"}`}
                >
                  <input type="radio" name="entrega" value={valor} checked={entrega === valor} onChange={() => setEntrega(valor)} className="sr-only" />
                  <Icono className="size-5 shrink-0" aria-hidden />
                  {texto}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {!negocio.deliveryEnabled && negocio.address && <p className="text-sm text-muted">Retiro en el local: {negocio.address}</p>}

        <fieldset className="flex flex-col gap-4">
          <legend className="font-semibold">Tus datos</legend>
          <label className="block">
            <span className="text-sm font-medium">Nombre</span>
            <input value={datos.name} onChange={cambiar("name")} autoComplete="name" maxLength={80} className={campo} aria-describedby={campos["customer.name"] ? "error-customer.name" : undefined} />
            {errorDe("customer.name")}
          </label>
          <label className="block">
            <span className="text-sm font-medium">Celular</span>
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
            <legend className="col-span-3 font-semibold">Dirección de entrega</legend>
            <label className="col-span-2 block">
              <span className="text-sm font-medium">Calle</span>
              <input value={datos.street} onChange={cambiar("street")} autoComplete="address-line1" maxLength={80} className={campo} />
              {errorDe("address.street")}
            </label>
            <label className="block">
              <span className="text-sm font-medium">Altura</span>
              <input value={datos.number} onChange={cambiar("number")} inputMode="numeric" maxLength={10} className={campo} />
              {errorDe("address.number")}
            </label>
            <label className="col-span-2 block">
              <span className="text-sm font-medium">Barrio</span>
              <input value={datos.neighborhood} onChange={cambiar("neighborhood")} maxLength={60} className={campo} />
              {errorDe("address.neighborhood")}
            </label>
            <label className="block">
              <span className="text-sm font-medium">Piso/depto</span>
              <input value={datos.unit} onChange={cambiar("unit")} maxLength={20} className={campo} />
            </label>
            <label className="col-span-3 block">
              <span className="text-sm font-medium">Referencias</span>
              <span className="ml-2 text-sm text-muted">Opcional</span>
              <input value={datos.reference} onChange={cambiar("reference")} maxLength={120} placeholder="Portón negro, timbre 2" className={campo} />
            </label>
          </fieldset>
        )}

        <fieldset>
          <legend className="font-semibold">¿Cómo pagás?</legend>
          <div className="mt-2 flex flex-col gap-2">
            {negocio.acceptCash && (
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4">
                <input type="radio" name="pago" checked={pago === "CASH"} onChange={() => setPago("CASH")} className="size-5 accent-[var(--primary)]" />
                Efectivo
              </label>
            )}
            {negocio.acceptTransfer && (
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4">
                <input type="radio" name="pago" checked={pago === "TRANSFER"} onChange={() => setPago("TRANSFER")} className="size-5 accent-[var(--primary)]" />
                Transferencia
              </label>
            )}
          </div>
          {pago === "CASH" && (
            <label className="mt-3 block">
              <span className="text-sm font-medium">¿Con cuánto pagás?</span>
              <span className="ml-2 text-sm text-muted">Opcional, para llevarte el cambio</span>
              <input value={pagoCon} onChange={(e) => setPagoCon(e.target.value)} inputMode="decimal" placeholder={String(Math.ceil(total / 100))} className={campo} />
              {errorDe("payment.changeFor")}
            </label>
          )}
          {pago === "TRANSFER" && negocio.acceptTransfer && (
            <p className="mt-3 rounded-2xl bg-stone-100 px-4 py-3 text-sm">Al confirmar te mostramos el alias para transferir. El local verifica el pago.</p>
          )}
        </fieldset>

        <label className="block">
          <span className="font-semibold">Aclaraciones para el local</span>
          <span className="ml-2 text-sm text-muted">Opcional</span>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} rows={2} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-4 py-3" />
          {errorDe("note")}
        </label>

        <dl className="space-y-1 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">
              {resumen.unidades} {resumen.unidades === 1 ? "producto" : "productos"}
            </dt>
            <dd className="tabular-nums">{formatearPesos(resumen.subtotalCents)}</dd>
          </div>
          {entrega === "DELIVERY" && (
            <div className="flex justify-between">
              <dt className="text-muted">Envío</dt>
              <dd className="tabular-nums">{envio ? formatearPesos(envio) : "Gratis"}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-stone-100 pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatearPesos(total)}</dd>
          </div>
        </dl>

        <p className="text-xs text-muted">
          Tus datos (nombre, celular{entrega === "DELIVERY" ? " y dirección" : ""}) se usan solo para que {negocio.name} prepare y entregue tu pedido. Los recibe el local.
        </p>
      </form>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-2xl">
          <button
            type="submit"
            form="pedido"
            disabled={enviando || !!cerrado || resumen.hayProblemas || resumen.faltanteMinimoCents > 0}
            className="flex h-14 w-full items-center justify-between rounded-full bg-[var(--primary)] px-5 font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
          >
            <span>{enviando ? "Enviando…" : "Confirmar pedido"}</span>
            <span className="tabular-nums">{formatearPesos(total)}</span>
          </button>
          {cerrado && <p className="mt-2 text-center text-sm text-muted">Ahora no estamos tomando pedidos.</p>}
          {!cerrado && resumen.hayProblemas && <p className="mt-2 text-center text-sm text-muted">Revisá tu carrito: algo cambió en el menú.</p>}
        </div>
      </div>

      {cambios && (
        <div role="dialog" aria-modal="true" aria-labelledby="cambios-titulo" className="fixed inset-0 z-30 grid place-items-end bg-black/50 sm:place-items-center">
          <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 sm:rounded-3xl">
            <h2 id="cambios-titulo" className="text-lg font-bold">
              Algunos productos cambiaron
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {cambios.map((c, i) => (
                <li key={i} className="rounded-xl bg-stone-100 px-3 py-2">
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
              <button type="button" onClick={aceptarCambios} className="h-12 rounded-full bg-[var(--primary)] font-semibold text-[var(--primary-foreground)]">
                Aceptar cambios
              </button>
              <Link href={`/${negocio.slug}/carrito`} className="grid h-12 place-items-center rounded-full border border-stone-300 font-medium">
                Volver al carrito
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
