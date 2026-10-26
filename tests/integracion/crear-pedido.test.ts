import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/bd";
import { crearPedido, listarPedidosPanel, marcarCobrado, obtenerSeguimiento, PedidoNuevo, type PedidoNuevoDatos } from "@/modulos/pedidos";
import { borrarPedidos, hayBase, negocioSeed, sesionDe } from "./ayudantes";

/**
 * Creación de pedidos (Fase 5) sobre la-esquina del seed: abre de lunes a sábado 11–15 y 19:30–23:30,
 * envío $ 1.500, mínimo $ 5.000, efectivo y transferencia.
 */
const ABIERTO = new Date("2026-10-21T21:00:00-03:00"); // miércoles
const DOMINGO = new Date("2026-10-25T21:00:00-03:00");

describe.skipIf(!hayBase)("crear pedido (integración)", () => {
  let A: Awaited<ReturnType<typeof negocioSeed>>;
  let milanesa: { id: string; priceCents: number };
  let gaseosa: { id: string; priceCents: number };
  let lasagnaAgotada: { id: string };
  let papas: string;
  let huevo: string;
  let telefonoN = 0;

  beforeAll(async () => {
    A = await negocioSeed("la-esquina");
    const productos = await db.product.findMany({ where: { businessId: A.id } });
    milanesa = productos.find((p) => p.name === "Milanesa napolitana")!;
    gaseosa = productos.find((p) => p.name === "Gaseosa 1,5 L")!;
    lasagnaAgotada = productos.find((p) => p.name === "Lasaña de verdura")!;
    papas = (await db.option.findFirstOrThrow({ where: { businessId: A.id, name: "Papas fritas" } })).id;
    huevo = (await db.option.findFirstOrThrow({ where: { businessId: A.id, name: "Huevo frito" } })).id;
    await limpiar();
  });

  /** Pedidos de prueba: celulares 381 555 20xx. */
  async function limpiar() {
    const creados = await db.order.findMany({ where: { businessId: A.id, customerPhone: { startsWith: "+54938155520" } }, select: { id: true } });
    await borrarPedidos(creados.map((o) => o.id));
  }

  afterAll(async () => {
    await limpiar();
    await db.business.update({ where: { id: A.id }, data: { acceptingOrders: true, autoConfirm: false } });
    await db.$disconnect();
  });

  /** Datos ya validados por el esquema, como los recibe el servicio. */
  function pedido(cambios: Partial<Record<string, unknown>> = {}): PedidoNuevoDatos {
    telefonoN++;
    return PedidoNuevo.parse({
      clientRequestId: randomUUID(),
      menuVersion: 1,
      fulfillment: "PICKUP",
      customer: { name: "Cliente Test", phone: `381 555 20${String(telefonoN).padStart(2, "0")}` },
      payment: { method: "CASH" },
      items: [{ productId: milanesa.id, quantity: 1, optionIds: [papas, huevo] }],
      ...cambios,
    });
  }

  const crear = (datos: PedidoNuevoDatos, ahora = ABIERTO) => crearPedido({ slug: "la-esquina", datos, ip: null, ahora });

  it("crea el pedido con el total calculado en el servidor, la copia de los ítems y el historial", async () => {
    // El precio que manda el navegador no se usa para calcular.
    const datos = pedido({ items: [{ productId: milanesa.id, quantity: 2, optionIds: [papas, huevo], expectedUnitCents: milanesa.priceCents + 60_000 }] });
    const { pedido: creado, repetido } = await crear(datos);
    expect(repetido).toBe(false);
    expect(creado.code).toMatch(/^[2-9A-HJKMNP-Z]{4}$/);
    expect(creado.token).toHaveLength(22);
    expect(creado.status).toBe("PENDING");
    expect(creado.totalCents).toBe(2 * (milanesa.priceCents + 60_000));

    const guardado = await db.order.findUniqueOrThrow({ where: { publicToken: creado.token }, include: { items: { include: { options: true } }, statusHistory: true } });
    expect(guardado.customerPhone).toBe(`+549381555200${telefonoN}`.replace(/200(\d{2})$/, "200$1"));
    expect(guardado.items[0]).toMatchObject({ productName: "Milanesa napolitana", quantity: 2 });
    expect(guardado.items[0].options.map((o) => o.optionName).sort()).toEqual(["Huevo frito", "Papas fritas"]);
    expect(guardado.statusHistory).toEqual([expect.objectContaining({ fromStatus: null, toStatus: "PENDING", userId: null })]);
  });

  it("el mismo envío dos veces (doble toque o en paralelo) crea un solo pedido (RF-014)", async () => {
    const datos = pedido();
    const primero = await crear(datos);
    const segundo = await crear(datos);
    expect(segundo).toEqual({ pedido: primero.pedido, repetido: true });

    const paralelo = pedido();
    const [a, b] = await Promise.all([crear(paralelo), crear(paralelo)]);
    expect(a.pedido.token).toBe(b.pedido.token);
    expect(await db.order.count({ where: { businessId: A.id, clientRequestId: paralelo.clientRequestId } })).toBe(1);
  });

  it("fuera de horario o con los pedidos pausados responde NOT_ACCEPTING_ORDERS (RN-10)", async () => {
    await expect(crear(pedido(), DOMINGO)).rejects.toMatchObject({ code: "NOT_ACCEPTING_ORDERS" });
    await db.business.update({ where: { id: A.id }, data: { acceptingOrders: false, pauseMessage: "Volvemos en 20 minutos" } });
    try {
      await expect(crear(pedido())).rejects.toMatchObject({ code: "NOT_ACCEPTING_ORDERS", message: "Volvemos en 20 minutos" });
    } finally {
      await db.business.update({ where: { id: A.id }, data: { acceptingOrders: true, pauseMessage: null } });
    }
  });

  it("producto agotado, de otro negocio o con precio cambiado: MENU_CHANGED con el detalle (RN-05, RN-06)", async () => {
    await expect(crear(pedido({ items: [{ productId: lasagnaAgotada.id, quantity: 1 }] }))).rejects.toMatchObject({
      code: "MENU_CHANGED",
      details: [{ productId: lasagnaAgotada.id, change: "SOLD_OUT" }],
    });
    const deOtro = await db.product.findFirstOrThrow({ where: { business: { slug: "don-pepe" } } });
    await expect(crear(pedido({ items: [{ productId: deOtro.id, quantity: 1 }] }))).rejects.toMatchObject({
      code: "MENU_CHANGED",
      details: [{ productId: deOtro.id, change: "UNAVAILABLE" }],
    });
    await expect(crear(pedido({ items: [{ productId: gaseosa.id, quantity: 2, expectedUnitCents: 1 }] }))).rejects.toMatchObject({
      code: "MENU_CHANGED",
      details: [{ change: "PRICE", oldCents: 1, newCents: gaseosa.priceCents }],
    });
  });

  it("por debajo del mínimo: MIN_ORDER_NOT_REACHED con lo que falta (RN-08)", async () => {
    await expect(crear(pedido({ items: [{ productId: gaseosa.id, quantity: 1 }] }))).rejects.toMatchObject({
      code: "MIN_ORDER_NOT_REACHED",
      details: [{ missingCents: 500_000 - gaseosa.priceCents }],
    });
  });

  it("delivery suma el envío; el pago con efectivo tiene que cubrir el total", async () => {
    const delivery = pedido({ fulfillment: "DELIVERY", address: { street: "Mendoza", number: "1200", neighborhood: "Centro" } });
    const { pedido: creado } = await crear(delivery);
    expect(creado.deliveryFeeCents).toBe(150_000);
    expect(creado.totalCents).toBe(creado.subtotalCents + 150_000);

    await expect(crear(pedido({ payment: { method: "CASH", changeFor: 100 } }))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { "payment.changeFor": expect.any(String) },
    });
  });

  it("un mismo celular no puede tener más de 2 pedidos pendientes a la vez (RN-17)", async () => {
    const base = pedido();
    const telefono = base.customer.phone;
    await crear(base);
    await crear({ ...pedido(), customer: { name: "x", phone: telefono } });
    await expect(crear({ ...pedido(), customer: { name: "x", phone: telefono } })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("si el negocio confirma automáticamente, el pedido nace CONFIRMED (ADR-008)", async () => {
    await db.business.update({ where: { id: A.id }, data: { autoConfirm: true } });
    try {
      const { pedido: creado } = await crear(pedido());
      expect(creado.status).toBe("CONFIRMED");
      const guardado = await db.order.findUniqueOrThrow({ where: { publicToken: creado.token } });
      expect(guardado.confirmedAt).not.toBeNull();
    } finally {
      await db.business.update({ where: { id: A.id }, data: { autoConfirm: false } });
    }
  });

  it("20 pedidos seguidos el mismo día tienen códigos distintos", async () => {
    const codigos = new Set<string>();
    for (let i = 0; i < 20; i++) codigos.add((await crear(pedido())).pedido.code);
    expect(codigos.size).toBe(20);
  }, 60_000);

  it("el seguimiento no muestra teléfono ni dirección y no se puede ver desde otro negocio (RF-017)", async () => {
    const delivery = pedido({ fulfillment: "DELIVERY", address: { street: "Calle Falsa", number: "742", neighborhood: "Centro", reference: "portón negro" } });
    const { pedido: creado } = await crear(delivery);
    const seguimiento = await obtenerSeguimiento("la-esquina", creado.token);
    expect(seguimiento).toMatchObject({ code: creado.code, status: "PENDING", barrio: "Centro", mensaje: "Pedido enviado. Falta que el local lo confirme." });
    const texto = JSON.stringify(seguimiento);
    expect(texto).not.toContain(delivery.customer.phone);
    expect(texto).not.toContain("Calle Falsa");
    expect(texto).not.toContain("portón");
    expect(await obtenerSeguimiento("don-pepe", creado.token)).toBeNull();
    expect(await obtenerSeguimiento("la-esquina", `${creado.token.slice(0, 21)}x`)).toBeNull();
    expect(await obtenerSeguimiento("la-esquina", "corto")).toBeNull();
  });

  it("el panel ve el pedido nuevo; con el cursor solo trae lo que cambió; cobrado queda registrado", async () => {
    const staff = await sesionDe("la-esquina", "STAFF");
    const inicial = await listarPedidosPanel(staff, null, ABIERTO);
    const { pedido: creado } = await crear(pedido());
    const cambios = await listarPedidosPanel(staff, new Date(inicial.cursor));
    expect(cambios.orders.map((o) => o.code)).toContain(creado.code);
    expect(cambios.orders.every((o) => o.customerPhone)).toBe(true);

    const id = cambios.orders.find((o) => o.code === creado.code)!.id;
    const cobrado = await marcarCobrado(staff, id, true);
    expect(cobrado.paidAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { entityId: id, action: "order.marked_paid" } })).toBe(1);

    // Otro negocio no lo ve ni lo puede tocar.
    const otro = await sesionDe("don-pepe", "OWNER");
    await expect(marcarCobrado(otro, id, false)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const delOtro = await listarPedidosPanel(otro, null);
    expect(delOtro.orders.some((o) => o.id === id)).toBe(false);
  });
});

describe("esquema del pedido", () => {
  const base = {
    clientRequestId: randomUUID(),
    menuVersion: 1,
    fulfillment: "PICKUP",
    customer: { name: " Ana ", phone: "0381 15-555-1234" },
    payment: { method: "CASH" },
    items: [{ productId: randomUUID(), quantity: 1 }],
  };

  it("normaliza el celular y recorta textos", () => {
    const r = PedidoNuevo.parse({ ...base, note: "   " });
    expect(r.customer).toEqual({ name: "Ana", phone: "+5493815551234" });
    expect(r.note).toBeNull();
  });

  it("delivery sin dirección, celular inválido o campos de más: 400 por campo", () => {
    const sinDireccion = PedidoNuevo.safeParse({ ...base, fulfillment: "DELIVERY" });
    expect(sinDireccion.success).toBe(false);
    expect(sinDireccion.error?.issues[0].path).toEqual(["address", "street"]);
    expect(PedidoNuevo.safeParse({ ...base, customer: { name: "Ana", phone: "12345" } }).success).toBe(false);
    expect(PedidoNuevo.safeParse({ ...base, totalCents: 1 }).success).toBe(false);
    expect(PedidoNuevo.safeParse({ ...base, address: { street: " ", number: "1", neighborhood: "x" }, fulfillment: "DELIVERY" }).success).toBe(false);
  });
});
