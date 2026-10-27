import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/bd";
import type { UsuarioSesion } from "@/modulos/autenticacion";
import { obtenerMetricas } from "@/modulos/metricas";
import { borrarPedidos, crearPedidoDePrueba, hayBase, sesionDe } from "./ayudantes";

/**
 * Métricas (Fase 7) con pedidos propios en fechas sin datos del seed (marzo de 2020), así los
 * resultados se pueden calcular a mano. Cada pedido de prueba es 1 milanesa con papas + 1 gaseosa.
 */
describe.skipIf(!hayBase)("métricas (integración)", () => {
  const DIA = "2020-03-10";
  const OTRO_DIA = "2020-03-11";
  const ids: string[] = [];
  let manager: UsuarioSesion;
  let staff: UsuarioSesion;
  let ownerB: UsuarioSesion;
  let total = 0; // total de un pedido de retiro
  let totalDelivery = 0;

  /** Pedido de prueba en el día y estado pedidos, con horas en Buenos Aires (UTC-3). */
  async function pedido(sesion: UsuarioSesion, dia: string, hora: number, estado: "PENDING" | "CONFIRMED" | "DELIVERED" | "CANCELLED", extra: { delivery?: boolean; preparacionMin?: number; cobrado?: boolean } = {}) {
    const creado = await crearPedidoDePrueba(sesion.businessId, extra.delivery ? "DELIVERY" : "PICKUP");
    ids.push(creado.id);
    const createdAt = new Date(`${dia}T${String(hora).padStart(2, "0")}:15:00-03:00`);
    const confirmedAt = estado === "PENDING" ? null : new Date(createdAt.getTime() + 2 * 60_000);
    await db.order.update({
      where: { id: creado.id },
      data: {
        businessDate: new Date(`${dia}T00:00:00Z`),
        createdAt,
        status: estado,
        confirmedAt,
        readyAt: estado === "DELIVERED" && confirmedAt ? new Date(confirmedAt.getTime() + (extra.preparacionMin ?? 20) * 60_000) : null,
        cancelReason: estado === "CANCELLED" ? "OUT_OF_STOCK" : null,
        ...(extra.cobrado && { paidAt: createdAt, paidBy: sesion.userId }),
      },
    });
    return creado;
  }

  beforeAll(async () => {
    [manager, staff, ownerB] = await Promise.all([sesionDe("la-esquina", "MANAGER"), sesionDe("la-esquina", "STAFF"), sesionDe("don-pepe", "OWNER")]);
    // Día 1: 12 entregados (retiro, 21 h, preparación 10..32 min), 1 delivery entregado, 2 cancelados, 1 pendiente.
    for (let i = 0; i < 12; i++) total = (await pedido(manager, DIA, 21, "DELIVERED", { preparacionMin: 10 + i * 2, cobrado: i < 5 })).totalCents;
    totalDelivery = (await pedido(manager, DIA, 13, "DELIVERED", { delivery: true, preparacionMin: 30 })).totalCents;
    await pedido(manager, DIA, 22, "CANCELLED");
    await pedido(manager, DIA, 22, "CANCELLED", { cobrado: false });
    await pedido(manager, DIA, 23, "PENDING");
    // Día 2: un confirmado. Y uno de otro negocio el mismo día, que nunca debe contarse.
    await pedido(manager, OTRO_DIA, 12, "CONFIRMED");
    await pedido(ownerB, DIA, 21, "DELIVERED");
  });

  afterAll(() => borrarPedidos(ids));

  it("solo el encargado o el dueño ven las métricas", async () => {
    await expect(obtenerMetricas(staff, { desde: DIA, hasta: DIA })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("valida el período: fechas reales, en orden y hasta 366 días", async () => {
    await expect(obtenerMetricas(manager, { desde: null, hasta: DIA })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(obtenerMetricas(manager, { desde: "2020-02-30", hasta: DIA })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(obtenerMetricas(manager, { desde: OTRO_DIA, hasta: DIA })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(obtenerMetricas(manager, { desde: "2019-01-01", hasta: "2020-03-10" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(obtenerMetricas(manager, { desde: "2019-03-10", hasta: "2020-03-09" })).resolves.toBeTruthy(); // 366 días (2020 es bisiesto)
  });

  it("cuenta cada pedido en su día y con su estado actual, solo del negocio de la sesión", async () => {
    const m = await obtenerMetricas(manager, { desde: DIA, hasta: DIA });
    expect(m.pedidos).toEqual({ recibidos: 16, entregados: 13, cancelados: 2, activos: 1 });
    expect(m.pedidos.recibidos).toBe(m.pedidos.entregados + m.pedidos.cancelados + m.pedidos.activos);
    const dosDias = await obtenerMetricas(manager, { desde: DIA, hasta: OTRO_DIA });
    expect(dosDias.pedidos).toEqual({ recibidos: 17, entregados: 13, cancelados: 2, activos: 2 });
  });

  it("importes: ventas, bruto sin cancelados, cancelado, cobrado y ticket promedio", async () => {
    const { importes } = await obtenerMetricas(manager, { desde: DIA, hasta: DIA });
    const ventas = 12 * total + totalDelivery;
    expect(importes.ventasCents).toBe(ventas);
    expect(importes.brutoCents).toBe(ventas + total); // + el pendiente
    expect(importes.canceladoCents).toBe(2 * total);
    expect(importes.cobradoCents).toBe(5 * total);
    expect(importes.ticketPromedioCents).toBe(Math.round(ventas / 13));
  });

  it("productos y categorías más pedidos, sin los cancelados", async () => {
    const m = await obtenerMetricas(manager, { desde: DIA, hasta: DIA });
    // 14 pedidos no cancelados × 1 de cada producto.
    expect(m.productos.map((p) => p.cantidad)).toEqual([14, 14]);
    expect(m.productos.map((p) => p.nombre).sort()).toEqual(expect.arrayContaining([expect.stringMatching(/Milanesa napolitana$/), expect.stringMatching(/Gaseosa 1,5 L$/)]));
    expect(m.categorias.reduce((s, c) => s + c.cantidad, 0)).toBe(28);
  });

  it("retiro vs. delivery, horas de demanda y estados", async () => {
    const m = await obtenerMetricas(manager, { desde: DIA, hasta: DIA });
    expect(m.entrega).toEqual({ retiro: { cantidad: 13, porcentaje: 93 }, delivery: { cantidad: 1, porcentaje: 7 } });
    expect(m.horas).toHaveLength(24);
    expect(m.horas.filter((h) => h.cantidad > 0)).toEqual([
      { hora: 13, cantidad: 1 },
      { hora: 21, cantidad: 12 },
      { hora: 23, cantidad: 1 }, // los de las 22 están cancelados
    ]);
    expect(m.estados).toEqual([
      { estado: "DELIVERED", cantidad: 13 },
      { estado: "CANCELLED", cantidad: 2 },
      { estado: "PENDING", cantidad: 1 },
    ]);
  });

  it("tiempo de preparación: mediana con 10 o más entregados; con menos no se muestra", async () => {
    // Preparaciones: 10, 12, …, 32 y 30 → 13 valores, la mediana es 22.
    const m = await obtenerMetricas(manager, { desde: DIA, hasta: DIA });
    expect(m.tiempoPreparacion).toEqual({ pedidos: 13, medianaMinutos: 22 });
    const pocos = await obtenerMetricas(ownerB, { desde: DIA, hasta: DIA });
    expect(pocos.tiempoPreparacion).toEqual({ pedidos: 1, medianaMinutos: null });
    expect(pocos.pedidos.recibidos).toBe(1);
  });

  it("un período sin pedidos da todo en cero, sin ticket promedio", async () => {
    const m = await obtenerMetricas(manager, { desde: "2020-01-01", hasta: "2020-01-01" });
    expect(m.pedidos).toEqual({ recibidos: 0, entregados: 0, cancelados: 0, activos: 0 });
    expect(m.importes.ticketPromedioCents).toBeNull();
    expect(m.entrega.retiro.porcentaje).toBe(0);
  });
});
