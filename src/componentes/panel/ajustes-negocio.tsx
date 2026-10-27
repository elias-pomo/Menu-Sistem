"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHidratado } from "@/componentes/use-hidratado";
import { formatearPesos, pesosACentavos } from "@/lib/dinero";
import { horaAMinutos, minutosAHora } from "@/modulos/negocio/horarios";
import { ErrorApi, llamarApi } from "./api";
import { SubirFoto } from "./subir-foto";

/**
 * Configuración del negocio (RF-034, RF-035) en tres secciones que se guardan por separado. Cada
 * una se muestra en modo lectura si el rol no la puede editar; el servidor lo vuelve a verificar.
 */

export type AjustesEditables = {
  name: string;
  address: string | null;
  whatsappE164: string | null;
  logoUrl: string | null;
  primaryColor: string;
  showPhotos: boolean;
  showDescriptions: boolean;
  deliveryEnabled: boolean;
  deliveryFeeCents: number;
  minOrderCents: number;
  acceptCash: boolean;
  acceptTransfer: boolean;
  transferAlias: string | null;
  transferHolder: string | null;
  autoConfirm: boolean;
  pendingAlertMinutes: number;
  openingHours: { weekday: number; opensMin: number; closesMin: number }[];
  puede: { datos: boolean; horarios: boolean; envioYPagos: boolean };
};

const CAMPO = "h-12 w-full rounded-xl border border-stone-300 bg-white px-4 disabled:bg-stone-50 disabled:text-stone-500";
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// La semana arranca el lunes, como la piensa un local.
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

const pesos = (centavos: number) => (centavos ? String(centavos / 100).replace(".", ",") : "0");

/** Estado de envío de una sección: errores por campo (sin el prefijo de la sección) y mensaje general. */
function useSeccion(seccion: "datos" | "horarios" | "envioYPagos") {
  const router = useRouter();
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(valor: unknown) {
    setEnviando(true);
    setErrores({});
    setMensaje(null);
    try {
      await llamarApi("PATCH", "/api/v1/admin/settings", { [seccion]: valor });
      setMensaje({ tipo: "ok", texto: "Guardado. El menú ya muestra los cambios." });
      router.refresh();
    } catch (err) {
      if (err instanceof ErrorApi) {
        const prefijo = `${seccion}.`;
        setErrores(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k.startsWith(prefijo) ? k.slice(prefijo.length) : k, v])));
        setMensaje({ tipo: "error", texto: err.message });
      } else setMensaje({ tipo: "error", texto: "Ocurrió un error." });
    } finally {
      setEnviando(false);
    }
  }

  const error = (clave: string) => errores[clave] && <p className="mt-1 text-sm text-red-700">{errores[clave]}</p>;
  return { guardar, error, mensaje, enviando, setErrores };
}

function Seccion(props: {
  titulo: string;
  detalle: string;
  editable: boolean;
  /** Quién la puede cambiar, para explicarlo cuando el rol no alcanza. */
  quien: string;
  enviando: boolean;
  mensaje: { tipo: "ok" | "error"; texto: string } | null;
  onGuardar: () => void;
  children: React.ReactNode;
}) {
  const hidratado = useHidratado();
  return (
    <form
      method="post"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        props.onGuardar();
      }}
      className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5"
    >
      <h2 className="text-lg font-bold">{props.titulo}</h2>
      <p className="mt-0.5 text-sm text-muted">{props.editable ? props.detalle : `${props.detalle} Lo puede cambiar ${props.quien}.`}</p>
      <fieldset disabled={!props.editable} className="mt-4 flex flex-col gap-4">
        {props.children}
      </fieldset>
      {props.mensaje && (
        <p role={props.mensaje.tipo === "error" ? "alert" : "status"} className={`mt-4 rounded-xl px-4 py-3 text-sm ${props.mensaje.tipo === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
          {props.mensaje.texto}
        </p>
      )}
      {props.editable && (
        <button type="submit" disabled={props.enviando || !hidratado} className="mt-4 h-12 w-full rounded-full bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto">
          {props.enviando ? "Guardando…" : "Guardar"}
        </button>
      )}
    </form>
  );
}

function Interruptor({ checked, onChange, children, detalle }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; detalle?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--primary)]" />
      <span>
        {children}
        {detalle && <span className="block text-sm text-muted">{detalle}</span>}
      </span>
    </label>
  );
}

export function AjustesNegocio({ ajustes }: { ajustes: AjustesEditables }) {
  return (
    <div className="flex flex-col gap-5">
      <SeccionDatos ajustes={ajustes} />
      <SeccionHorarios ajustes={ajustes} />
      <SeccionEnvioYPagos ajustes={ajustes} />
    </div>
  );
}

function SeccionDatos({ ajustes }: { ajustes: AjustesEditables }) {
  const s = useSeccion("datos");
  const [name, setName] = useState(ajustes.name);
  const [address, setAddress] = useState(ajustes.address ?? "");
  const [whatsapp, setWhatsapp] = useState(ajustes.whatsappE164 ?? "");
  const [logoUrl, setLogoUrl] = useState(ajustes.logoUrl);
  const [primaryColor, setPrimaryColor] = useState(ajustes.primaryColor);
  const [showPhotos, setShowPhotos] = useState(ajustes.showPhotos);
  const [showDescriptions, setShowDescriptions] = useState(ajustes.showDescriptions);

  return (
    <Seccion
      titulo="Datos del local"
      detalle="Lo que ve el cliente arriba del menú."
      editable={ajustes.puede.datos}
      quien="el encargado o el dueño"
      enviando={s.enviando}
      mensaje={s.mensaje}
      onGuardar={() => s.guardar({ name, address: address || null, whatsapp: whatsapp || null, logoUrl, primaryColor, showPhotos, showDescriptions })}
    >
      <label className="block">
        <span className="font-medium">Nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`mt-1 ${CAMPO}`} />
        {s.error("name")}
      </label>
      <label className="block">
        <span className="font-medium">Dirección</span>
        <span className="ml-2 text-sm text-muted">Opcional, para el retiro</span>
        <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={160} className={`mt-1 ${CAMPO}`} />
        {s.error("address")}
      </label>
      <label className="block">
        <span className="font-medium">WhatsApp del local</span>
        <span className="ml-2 text-sm text-muted">Opcional</span>
        <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" autoComplete="off" placeholder="381 555 1234" className={`mt-1 ${CAMPO}`} />
        {s.error("whatsapp")}
      </label>
      <div>
        <span className="font-medium">Logo</span>
        <span className="ml-2 text-sm text-muted">Opcional</span>
        <div className="mt-2">{ajustes.puede.datos ? <SubirFoto url={logoUrl} onCambio={setLogoUrl} /> : logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa del logo subido
            <img src={logoUrl} alt="Logo del local" className="size-20 rounded-xl object-cover" />
          ) : <p className="text-sm text-muted">Sin logo</p>}</div>
        {s.error("logoUrl")}
      </div>
      <label className="flex items-center gap-3">
        <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-12 w-16 cursor-pointer rounded-xl border border-stone-300 bg-white p-1" />
        <span>
          <span className="font-medium">Color principal</span>
          <span className="block text-sm text-muted">Botones y detalles del menú. El texto encima se ajusta solo para que se lea.</span>
        </span>
      </label>
      {s.error("primaryColor")}
      <Interruptor checked={showPhotos} onChange={setShowPhotos}>
        Mostrar fotos en el menú
      </Interruptor>
      <Interruptor checked={showDescriptions} onChange={setShowDescriptions}>
        Mostrar descripciones en el menú
      </Interruptor>
    </Seccion>
  );
}

type FranjaTexto = { clave: number; weekday: number; abre: string; cierra: string };
let siguienteClave = 0;

function SeccionHorarios({ ajustes }: { ajustes: AjustesEditables }) {
  const s = useSeccion("horarios");
  const [franjas, setFranjas] = useState<FranjaTexto[]>(() =>
    ajustes.openingHours.map((f) => ({ clave: siguienteClave++, weekday: f.weekday, abre: minutosAHora(f.opensMin), cierra: minutosAHora(f.closesMin) })),
  );
  const [errorLocal, setErrorLocal] = useState("");

  const cambiar = (clave: number, cambio: Partial<FranjaTexto>) => setFranjas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));

  function guardar() {
    setErrorLocal("");
    const datos = [];
    for (const f of franjas) {
      const opensMin = horaAMinutos(f.abre);
      const closesMin = horaAMinutos(f.cierra);
      if (opensMin === null || closesMin === null) return setErrorLocal(`${DIAS[f.weekday]}: completá la hora de apertura y de cierre.`);
      if (opensMin === closesMin) return setErrorLocal(`${DIAS[f.weekday]}: la apertura y el cierre no pueden ser iguales.`);
      datos.push({ weekday: f.weekday, opensMin, closesMin });
    }
    s.guardar(datos);
  }

  return (
    <Seccion
      titulo="Horarios"
      detalle="Fuera de horario el menú se puede ver pero no recibe pedidos. Un cierre antes de la apertura termina al día siguiente (ej. 20:00 a 01:00)."
      editable={ajustes.puede.horarios}
      quien="el encargado o el dueño"
      enviando={s.enviando}
      mensaje={errorLocal ? { tipo: "error", texto: errorLocal } : s.mensaje}
      onGuardar={guardar}
    >
      <ul className="divide-y divide-stone-100">
        {ORDEN_DIAS.map((dia) => {
          const delDia = franjas.filter((f) => f.weekday === dia);
          return (
            <li key={dia} className="py-3 first:pt-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{DIAS[dia]}</span>
                {delDia.length === 0 && <span className="text-sm text-muted">Cerrado</span>}
              </div>
              {delDia.map((f) => (
                <div key={f.clave} className="mt-2 flex items-center gap-2">
                  <input type="time" aria-label={`${DIAS[dia]}, abre`} value={f.abre} onChange={(e) => cambiar(f.clave, { abre: e.target.value })} className={`${CAMPO} min-w-0`} />
                  <span className="text-muted">a</span>
                  <input type="time" aria-label={`${DIAS[dia]}, cierra`} value={f.cierra} onChange={(e) => cambiar(f.clave, { cierra: e.target.value })} className={`${CAMPO} min-w-0`} />
                  <button type="button" aria-label={`Quitar franja del ${DIAS[dia].toLowerCase()}`} onClick={() => setFranjas((fs) => fs.filter((x) => x.clave !== f.clave))} className="grid size-11 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setFranjas((fs) => [...fs, { clave: siguienteClave++, weekday: dia, abre: delDia.length ? "20:00" : "11:00", cierra: delDia.length ? "23:30" : "15:00" }])}
                className="mt-2 inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-primary hover:bg-stone-100"
              >
                <Plus className="size-4" aria-hidden />
                {delDia.length ? "Agregar otro turno" : "Agregar horario"}
              </button>
            </li>
          );
        })}
      </ul>
    </Seccion>
  );
}

function SeccionEnvioYPagos({ ajustes }: { ajustes: AjustesEditables }) {
  const s = useSeccion("envioYPagos");
  const [deliveryEnabled, setDelivery] = useState(ajustes.deliveryEnabled);
  const [envio, setEnvio] = useState(pesos(ajustes.deliveryFeeCents));
  const [minimo, setMinimo] = useState(pesos(ajustes.minOrderCents));
  const [acceptCash, setCash] = useState(ajustes.acceptCash);
  const [acceptTransfer, setTransfer] = useState(ajustes.acceptTransfer);
  const [transferAlias, setAlias] = useState(ajustes.transferAlias ?? "");
  const [transferHolder, setHolder] = useState(ajustes.transferHolder ?? "");
  const [autoConfirm, setAuto] = useState(ajustes.autoConfirm);
  const [alerta, setAlerta] = useState(String(ajustes.pendingAlertMinutes));

  const envioCents = pesosACentavos(envio || "0");
  const minimoCents = pesosACentavos(minimo || "0");

  function guardar() {
    if (envioCents === null || minimoCents === null) {
      s.setErrores({ ...(envioCents === null && { deliveryFeeCents: "Ingresá un importe, por ejemplo 1.500." }), ...(minimoCents === null && { minOrderCents: "Ingresá un importe, por ejemplo 5.000." }) });
      return;
    }
    s.guardar({
      deliveryEnabled,
      deliveryFeeCents: envioCents,
      minOrderCents: minimoCents,
      acceptCash,
      acceptTransfer,
      transferAlias: transferAlias || null,
      transferHolder: transferHolder || null,
      autoConfirm,
      pendingAlertMinutes: Number(alerta) || 0,
    });
  }

  return (
    <Seccion titulo="Envío y pagos" detalle="Cambia el total que paga el cliente." editable={ajustes.puede.envioYPagos} quien="solo el dueño" enviando={s.enviando} mensaje={s.mensaje} onGuardar={guardar}>
      <Interruptor checked={deliveryEnabled} onChange={setDelivery} detalle="Si está apagado, el cliente solo puede retirar.">
        Hacer delivery
      </Interruptor>
      <div className="grid gap-4 sm:grid-cols-2">
        {deliveryEnabled && (
          <label className="block">
            <span className="font-medium">Costo de envío</span>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-muted">$</span>
              <input value={envio} onChange={(e) => setEnvio(e.target.value)} inputMode="decimal" className={`${CAMPO} pl-8`} />
            </div>
            {envioCents !== null && <p className="mt-1 text-sm text-muted">{envioCents ? formatearPesos(envioCents) : "Envío gratis"}</p>}
            {s.error("deliveryFeeCents")}
          </label>
        )}
        <label className="block">
          <span className="font-medium">Pedido mínimo</span>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-muted">$</span>
            <input value={minimo} onChange={(e) => setMinimo(e.target.value)} inputMode="decimal" className={`${CAMPO} pl-8`} />
          </div>
          {minimoCents !== null && <p className="mt-1 text-sm text-muted">{minimoCents ? `${formatearPesos(minimoCents)}, sin contar el envío` : "Sin mínimo"}</p>}
          {s.error("minOrderCents")}
        </label>
      </div>

      <fieldset>
        <legend className="font-medium">Medios de pago</legend>
        <div className="mt-1">
          <Interruptor checked={acceptCash} onChange={setCash}>
            Efectivo
          </Interruptor>
          <Interruptor checked={acceptTransfer} onChange={setTransfer} detalle="El cliente ve el alias en el seguimiento del pedido.">
            Transferencia
          </Interruptor>
        </div>
        {s.error("acceptCash")}
      </fieldset>
      {acceptTransfer && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="font-medium">Alias o CBU</span>
            <input value={transferAlias} onChange={(e) => setAlias(e.target.value)} maxLength={60} autoComplete="off" className={`mt-1 ${CAMPO}`} />
            {s.error("transferAlias")}
          </label>
          <label className="block">
            <span className="font-medium">Titular</span>
            <span className="ml-2 text-sm text-muted">Opcional</span>
            <input value={transferHolder} onChange={(e) => setHolder(e.target.value)} maxLength={80} className={`mt-1 ${CAMPO}`} />
            {s.error("transferHolder")}
          </label>
        </div>
      )}

      <Interruptor checked={autoConfirm} onChange={setAuto} detalle="Los pedidos entran confirmados, sin esperar a que el local los acepte.">
        Confirmar pedidos automáticamente
      </Interruptor>
      <label className="block">
        <span className="font-medium">Avisar pedido demorado a los</span>
        <div className="mt-1 flex items-center gap-2">
          <input value={alerta} onChange={(e) => setAlerta(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={`${CAMPO} w-24`} />
          <span>minutos sin confirmar</span>
        </div>
        {s.error("pendingAlertMinutes")}
      </label>
    </Seccion>
  );
}
