import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/bd";
import { AppError } from "@/lib/errores";
import { puede } from "@/modulos/autenticacion/permisos";
import type { UsuarioSesion } from "@/modulos/autenticacion";
import { fechaDeNegocio, obtenerNegocio } from "@/modulos/negocio";
import { problemaConPeriodo, type Periodo } from "./periodo";

/**
 * Métricas del local (RF-038) según la definición de la sección 7 del plan: cada pedido cuenta en
 * el día de su creación (hora de Buenos Aires, `business_date`) con su estado actual, así siempre
 * recibidos = entregados + cancelados + activos. Nunca se habla de ganancia: no hay costos.
 * Todas las consultas filtran por el negocio de la sesión y son agregadas en la base.
 */

/** El tiempo de preparación solo se muestra con al menos esta cantidad de pedidos entregados. */
export const MINIMO_PARA_TIEMPO = 10;
const TOP = 10;

type Fila<T> = T[];

export async function obtenerMetricas(sesion: UsuarioSesion, periodo: { desde: string | null; hasta: string | null }) {
  if (!puede(sesion.role, "metricas.ver")) throw new AppError("FORBIDDEN", "No tenés permiso para hacer esto.");
  const problema = problemaConPeriodo(periodo.desde, periodo.hasta);
  if (problema) throw new AppError("VALIDATION_ERROR", problema, { fields: { periodo: problema } });
  const { desde, hasta } = periodo as Periodo;
  const businessId = sesion.businessId;
  const negocio = await obtenerNegocio(businessId);
  const zona = negocio?.timezone ?? "America/Argentina/Buenos_Aires";

  const enPeriodo = { businessId, businessDate: { gte: new Date(`${desde}T00:00:00Z`), lte: new Date(`${hasta}T00:00:00Z`) } };
  // Mismo filtro en SQL: business_id y business_date entre los extremos.
  const filtroSql = Prisma.sql`o.business_id = ${businessId}::uuid AND o.business_date BETWEEN ${desde}::date AND ${hasta}::date`;

  const [porEstado, cobrado, porEntrega, productos, categorias, horas, tiempo] = await Promise.all([
    db.order.groupBy({ by: ["status"], where: enPeriodo, _count: { _all: true }, _sum: { totalCents: true } }),
    db.order.aggregate({ where: { ...enPeriodo, paidAt: { not: null }, status: { not: "CANCELLED" } }, _sum: { totalCents: true } }),
    db.order.groupBy({ by: ["fulfillment"], where: { ...enPeriodo, status: { not: "CANCELLED" } }, _count: { _all: true } }),
    db.$queryRaw<Fila<{ nombre: string; cantidad: number }>>`
      SELECT i.product_name AS nombre, SUM(i.quantity)::int AS cantidad
      FROM order_item i JOIN customer_order o ON o.business_id = i.business_id AND o.id = i.order_id
      WHERE ${filtroSql} AND o.status <> 'CANCELLED'
      GROUP BY i.product_name ORDER BY cantidad DESC, nombre ASC LIMIT ${TOP}`,
    db.$queryRaw<Fila<{ nombre: string; cantidad: number }>>`
      SELECT i.category_name AS nombre, SUM(i.quantity)::int AS cantidad
      FROM order_item i JOIN customer_order o ON o.business_id = i.business_id AND o.id = i.order_id
      WHERE ${filtroSql} AND o.status <> 'CANCELLED'
      GROUP BY i.category_name ORDER BY cantidad DESC, nombre ASC LIMIT ${TOP}`,
    db.$queryRaw<Fila<{ hora: number; cantidad: number }>>`
      SELECT EXTRACT(HOUR FROM o.created_at AT TIME ZONE ${zona})::int AS hora, COUNT(*)::int AS cantidad
      FROM customer_order o
      WHERE ${filtroSql} AND o.status <> 'CANCELLED'
      GROUP BY hora`,
    db.$queryRaw<Fila<{ pedidos: number; mediana: number | null }>>`
      SELECT COUNT(*)::int AS pedidos,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM o.ready_at - o.confirmed_at))::float AS mediana
      FROM customer_order o
      WHERE ${filtroSql} AND o.status = 'DELIVERED' AND o.ready_at IS NOT NULL AND o.confirmed_at IS NOT NULL AND o.ready_at >= o.confirmed_at`,
  ]);

  const cantidad = (estado?: string) => porEstado.filter((g) => !estado || g.status === estado).reduce((s, g) => s + g._count._all, 0);
  const suma = (filtro: (estado: string) => boolean) => porEstado.filter((g) => filtro(g.status)).reduce((s, g) => s + (g._sum.totalCents ?? 0), 0);

  const recibidos = cantidad();
  const entregados = cantidad("DELIVERED");
  const cancelados = cantidad("CANCELLED");
  const ventasCents = suma((e) => e === "DELIVERED");
  const noCancelados = porEntrega.reduce((s, g) => s + g._count._all, 0);
  const deEntrega = (tipo: "PICKUP" | "DELIVERY") => porEntrega.find((g) => g.fulfillment === tipo)?._count._all ?? 0;
  const porcentaje = (n: number) => (noCancelados ? Math.round((n / noCancelados) * 100) : 0);
  const conTiempo = tiempo[0]?.pedidos ?? 0;

  return {
    periodo: { desde, hasta },
    hoy: fechaDeNegocio(new Date(), zona),
    pedidos: { recibidos, entregados, cancelados, activos: recibidos - entregados - cancelados },
    importes: {
      brutoCents: suma((e) => e !== "CANCELLED"),
      ventasCents,
      canceladoCents: suma((e) => e === "CANCELLED"),
      cobradoCents: cobrado._sum.totalCents ?? 0,
      ticketPromedioCents: entregados ? Math.round(ventasCents / entregados) : null,
    },
    productos,
    categorias,
    entrega: {
      retiro: { cantidad: deEntrega("PICKUP"), porcentaje: porcentaje(deEntrega("PICKUP")) },
      delivery: { cantidad: deEntrega("DELIVERY"), porcentaje: porcentaje(deEntrega("DELIVERY")) },
    },
    // Las 24 horas, con 0 donde no hubo pedidos.
    horas: Array.from({ length: 24 }, (_, hora) => ({ hora, cantidad: horas.find((h) => h.hora === hora)?.cantidad ?? 0 })),
    tiempoPreparacion: {
      pedidos: conTiempo,
      medianaMinutos: conTiempo >= MINIMO_PARA_TIEMPO && tiempo[0]?.mediana != null ? Math.round(tiempo[0].mediana / 60) : null,
    },
    estados: porEstado.map((g) => ({ estado: g.status, cantidad: g._count._all })).sort((a, b) => b.cantidad - a.cantidad),
  };
}
export type Metricas = Awaited<ReturnType<typeof obtenerMetricas>>;
