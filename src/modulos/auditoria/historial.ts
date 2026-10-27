import "server-only";
import { db } from "@/lib/bd";
import { formatearPesos } from "@/lib/dinero";
import { AppError } from "@/lib/errores";
import { puede } from "@/modulos/autenticacion/permisos";
import type { UsuarioSesion } from "@/modulos/autenticacion";

/**
 * Historial administrativo para el dueño (RF-036). Solo lectura, del más nuevo al más viejo, con
 * cursor. Cada fila trae un texto en castellano armado acá: el panel no interpreta `before`/`after`.
 * Los ingresos al panel (`auth.login`) no se listan: serían la mayoría de las filas.
 */

const POR_PAGINA = 50;
// Los avisos de WhatsApp se ven en el detalle de cada pedido: acá serían ruido.
const OCULTAS = ["auth.login", "order.whatsapp_opened"];

const ETIQUETAS: Record<string, string> = {
  "auth.password_changed": "Cambió su contraseña",
  "category.created": "Creó la categoría",
  "category.updated": "Editó la categoría",
  "category.archived": "Archivó la categoría",
  "category.reordered": "Reordenó las categorías",
  "product.created": "Creó el producto",
  "product.updated": "Editó el producto",
  "product.price_changed": "Cambió el precio de",
  "product.archived": "Archivó el producto",
  "product.sold_out_changed": "Cambió el agotado de",
  "product.visibility_changed": "Cambió la visibilidad de",
  "product.reordered": "Reordenó los productos",
  "option_group.created": "Creó el grupo de opciones",
  "option_group.updated": "Editó el grupo de opciones",
  "option_group.archived": "Archivó el grupo de opciones",
  "image.uploaded": "Subió una foto",
  "order.marked_paid": "Marcó como cobrado el pedido",
  "order.unmarked_paid": "Desmarcó como cobrado el pedido",
  "order.cancelled": "Canceló el pedido",
  "order.status_reverted": "Volvió atrás el estado del pedido",
  "settings.business_updated": "Editó los datos del local",
  "settings.hours_updated": "Cambió los horarios",
  "settings.delivery_payments_updated": "Cambió envío y pagos",
  "settings.orders_paused": "Pausó los pedidos",
  "settings.orders_resumed": "Reanudó los pedidos",
  "user.created": "Creó el usuario",
  "user.updated": "Editó el usuario",
  "user.role_changed": "Cambió el rol de",
  "user.deactivated": "Desactivó a",
  "user.reactivated": "Reactivó a",
  "user.password_reset": "Le dio una contraseña nueva a",
};

const ROL: Record<string, string> = { OWNER: "dueño", MANAGER: "encargado", STAFF: "personal" };

type Registro = { action: string; entityId: string | null; before: unknown; after: unknown };
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** "Cambió el precio de Milanesa: $ 9.500 → $ 10.000". */
export function describirRegistro(r: Registro, nombres: Map<string, string>): string {
  const antes = objeto(r.before);
  const despues = objeto(r.after);
  const etiqueta = ETIQUETAS[r.action] ?? r.action;
  const nombre = (despues.name ?? antes.name ?? (r.entityId && nombres.get(r.entityId))) as string | undefined;
  const conNombre = ["user.", "product.", "category.", "option_group.", "order."].some((prefijo) => r.action.startsWith(prefijo));
  let texto = conNombre ? `${etiqueta}${nombre ? ` ${nombre}` : ""}` : etiqueta;
  if (r.action === "product.price_changed" && typeof antes.priceCents === "number" && typeof despues.priceCents === "number") {
    texto += `: ${formatearPesos(antes.priceCents)} → ${formatearPesos(despues.priceCents)}`;
  }
  if (r.action === "product.sold_out_changed") texto += despues.isSoldOut ? ": agotado" : ": disponible";
  if (r.action === "product.visibility_changed") texto += despues.isActive ? ": visible" : ": oculto";
  if ((r.action === "user.role_changed" || r.action === "user.created") && typeof despues.role === "string") texto += ` (${ROL[despues.role] ?? despues.role})`;
  if (r.action === "settings.orders_paused" && typeof despues.pauseMessage === "string") texto += `: “${despues.pauseMessage}”`;
  return texto;
}

/** Cursor = fecha ISO + "_" + id de la última fila de la página anterior. */
export async function listarHistorial(sesion: UsuarioSesion, cursor: string | null) {
  if (!puede(sesion.role, "auditoria.ver")) throw new AppError("FORBIDDEN", "No tenés permiso para hacer esto.");
  let desde: { createdAt: Date; id: string } | null = null;
  if (cursor) {
    const [iso, id] = cursor.split("_");
    const fecha = new Date(iso ?? "");
    if (!id || Number.isNaN(fecha.getTime())) throw new AppError("VALIDATION_ERROR", "Cursor inválido.", { fields: { cursor: "Cursor inválido." } });
    desde = { createdAt: fecha, id };
  }
  const filas = await db.auditLog.findMany({
    where: {
      businessId: sesion.businessId,
      action: { notIn: OCULTAS },
      ...(desde && { OR: [{ createdAt: { lt: desde.createdAt } }, { createdAt: desde.createdAt, id: { lt: desde.id } }] }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: POR_PAGINA + 1,
  });
  const pagina = filas.slice(0, POR_PAGINA);
  // Nombres de quien hizo cada cambio y de lo que se cambió (usuario, producto, categoría, grupo),
  // siempre del mismo negocio: hay acciones, como el agotado, que no guardan el nombre.
  const deTipo = (tipo: string) => [...new Set(pagina.filter((f) => f.entityType === tipo && f.entityId).map((f) => f.entityId!))];
  const idsUsuarios = [...new Set([...pagina.map((f) => f.userId).filter((v): v is string => Boolean(v)), ...deTipo("app_user")])];
  const businessId = sesion.businessId;
  const listas = await Promise.all([
    db.appUser.findMany({ where: { businessId, id: { in: idsUsuarios } }, select: { id: true, name: true } }),
    db.product.findMany({ where: { businessId, id: { in: deTipo("product") } }, select: { id: true, name: true } }),
    db.category.findMany({ where: { businessId, id: { in: deTipo("category") } }, select: { id: true, name: true } }),
    db.optionGroup.findMany({ where: { businessId, id: { in: deTipo("option_group") } }, select: { id: true, name: true } }),
    db.order.findMany({ where: { businessId, id: { in: deTipo("order") } }, select: { id: true, publicCode: true } }).then((l) => l.map((o) => ({ id: o.id, name: o.publicCode }))),
  ]);
  const nombres = new Map(listas.flat().map((e) => [e.id, e.name]));
  const ultima = pagina.at(-1);
  return {
    entries: pagina.map((f) => ({
      id: f.id,
      createdAt: f.createdAt.toISOString(),
      user: f.userId ? (nombres.get(f.userId) ?? "Usuario eliminado") : "Sistema",
      description: describirRegistro(f, nombres),
    })),
    nextCursor: filas.length > POR_PAGINA && ultima ? `${ultima.createdAt.toISOString()}_${ultima.id}` : null,
  };
}
