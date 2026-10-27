import "server-only";
import { revalidateTag } from "next/cache";
import { db, type Tx } from "@/lib/bd";
import { AppError } from "@/lib/errores";
import { normalizarCelularAR } from "@/lib/telefono";
import { registrarAuditoria } from "@/modulos/auditoria";
import { puede, type Permiso } from "@/modulos/autenticacion/permisos";
import type { UsuarioSesion } from "@/modulos/autenticacion";
import { etiquetaMenu } from "@/modulos/menu";
import type { NegocioId } from "@/modulos/negocio/alcance";
import type { CambiosAjustesDatos, DatosNegocioDatos, EnvioYPagosDatos, HorariosDatos } from "./esquemas";

/**
 * Configuración del negocio desde el panel (Fase 6b, RF-034 y RF-035). Cada sección tiene su
 * permiso: datos y horarios el encargado, envío y pagos solo el dueño, pausa cualquier usuario.
 * Todo cambio deja registro en la auditoría e invalida la caché del menú público, que muestra estos
 * datos (envío, mínimo, pagos, horarios, pausa).
 */

function exigir(sesion: UsuarioSesion, permiso: Permiso) {
  if (!puede(sesion.role, permiso)) throw new AppError("FORBIDDEN", "No tenés permiso para hacer esto.");
}

const campoInvalido = (campo: string, mensaje: string) => new AppError("VALIDATION_ERROR", "Revisá los datos.", { fields: { [campo]: mensaje } });

const seleccion = {
  slug: true,
  name: true,
  address: true,
  whatsappE164: true,
  logoUrl: true,
  primaryColor: true,
  showPhotos: true,
  showDescriptions: true,
  acceptingOrders: true,
  pauseMessage: true,
  deliveryEnabled: true,
  deliveryFeeCents: true,
  minOrderCents: true,
  acceptCash: true,
  acceptTransfer: true,
  transferAlias: true,
  transferHolder: true,
  autoConfirm: true,
  pendingAlertMinutes: true,
  timezone: true,
  openingHours: { select: { weekday: true, opensMin: true, closesMin: true }, orderBy: [{ weekday: "asc" as const }, { opensMin: "asc" as const }] },
};

/** Configuración completa para el panel. La ve cualquier usuario del local; edita según el rol. */
export async function obtenerAjustes(sesion: UsuarioSesion) {
  exigir(sesion, "pedidos.ver");
  const negocio = await db.business.findUniqueOrThrow({ where: { id: sesion.businessId }, select: seleccion });
  return {
    ...negocio,
    puede: {
      datos: puede(sesion.role, "negocio.datos"),
      horarios: puede(sesion.role, "negocio.horarios"),
      envioYPagos: puede(sesion.role, "negocio.envioYPagos"),
    },
  };
}
export type Ajustes = Awaited<ReturnType<typeof obtenerAjustes>>;

/** Transacción de un cambio de configuración: al terminar bien, invalida la caché del menú. */
async function cambiarNegocio<T>(businessId: NegocioId, cambio: (tx: Tx) => Promise<T>): Promise<T> {
  const { resultado, slug } = await db.$transaction(async (tx) => {
    const resultado = await cambio(tx);
    const { slug } = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { slug: true } });
    return { resultado, slug };
  });
  revalidateTag(etiquetaMenu(slug), { expire: 0 });
  return resultado;
}

/**
 * PATCH /admin/settings. Primero autoriza todas las secciones que vienen: si una no está permitida,
 * no se guarda ninguna (403).
 */
export async function guardarAjustes(sesion: UsuarioSesion, cambios: CambiosAjustesDatos) {
  if (cambios.datos) exigir(sesion, "negocio.datos");
  if (cambios.horarios) exigir(sesion, "negocio.horarios");
  if (cambios.envioYPagos) exigir(sesion, "negocio.envioYPagos");

  const datos = cambios.datos ? prepararDatos(cambios.datos) : null;
  const businessId = sesion.businessId;
  await cambiarNegocio(businessId, async (tx) => {
    const antes = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: seleccion });
    if (datos) {
      await tx.business.update({ where: { id: businessId }, data: datos });
      await auditar(tx, sesion, "settings.business_updated", soloClaves(antes, datos), datos);
    }
    if (cambios.horarios) {
      const franjas = ordenarFranjas(cambios.horarios);
      await tx.openingHour.deleteMany({ where: { businessId } });
      if (franjas.length) await tx.openingHour.createMany({ data: franjas.map((f) => ({ businessId, ...f })) });
      await auditar(tx, sesion, "settings.hours_updated", antes.openingHours, franjas);
    }
    if (cambios.envioYPagos) {
      const envio = prepararEnvioYPagos(cambios.envioYPagos);
      await tx.business.update({ where: { id: businessId }, data: envio });
      await auditar(tx, sesion, "settings.delivery_payments_updated", soloClaves(antes, envio), envio);
    }
  });
  return obtenerAjustes(sesion);
}

/** Pausar o reanudar los pedidos (RF-034). Lo puede hacer cualquier usuario del local. */
export async function pausarPedidos(sesion: UsuarioSesion, pausa: { paused: boolean; message: string | null }) {
  exigir(sesion, "negocio.pausar");
  const data = { acceptingOrders: !pausa.paused, pauseMessage: pausa.paused ? pausa.message : null };
  await cambiarNegocio(sesion.businessId, async (tx) => {
    await tx.business.update({ where: { id: sesion.businessId }, data });
    await auditar(tx, sesion, pausa.paused ? "settings.orders_paused" : "settings.orders_resumed", null, data);
  });
  return data;
}

function prepararDatos(d: DatosNegocioDatos) {
  let whatsappE164: string | null = null;
  if (d.whatsapp) {
    whatsappE164 = normalizarCelularAR(d.whatsapp);
    if (!whatsappE164) throw campoInvalido("datos.whatsapp", "Ingresá un celular argentino, por ejemplo 381 555 1234.");
  }
  return {
    name: d.name,
    address: d.address,
    whatsappE164,
    logoUrl: d.logoUrl,
    primaryColor: d.primaryColor.toLowerCase(),
    showPhotos: d.showPhotos,
    showDescriptions: d.showDescriptions,
  };
}

function prepararEnvioYPagos(e: EnvioYPagosDatos) {
  return {
    ...e,
    // Sin delivery, el costo de envío no se usa: se guarda en 0 para que no confunda.
    deliveryFeeCents: e.deliveryEnabled ? e.deliveryFeeCents : 0,
    transferAlias: e.acceptTransfer ? e.transferAlias : null,
    transferHolder: e.acceptTransfer ? e.transferHolder : null,
  };
}

/** Ordena por día y apertura, y descarta franjas repetidas. */
export function ordenarFranjas(franjas: HorariosDatos): HorariosDatos {
  const unicas = new Map(franjas.map((f) => [`${f.weekday}-${f.opensMin}-${f.closesMin}`, f]));
  return [...unicas.values()].sort((a, b) => a.weekday - b.weekday || a.opensMin - b.opensMin);
}

function soloClaves<T extends object>(antes: Record<string, unknown>, despues: T): Partial<T> {
  return Object.fromEntries(Object.keys(despues).map((k) => [k, antes[k]])) as Partial<T>;
}

function auditar(tx: Tx, sesion: UsuarioSesion, action: string, before: unknown, after: unknown) {
  return registrarAuditoria(tx, { businessId: sesion.businessId, userId: sesion.userId, action, entityType: "business", entityId: sesion.businessId, before, after });
}
