import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/bd";
import { cambiarEstado } from "@/modulos/pedidos";
import { borrarPedidos, crearPedidoDePrueba, hayBase, negocioSeed, sesionDe } from "./ayudantes";

describe.skipIf(!hayBase)("pedidos (integración)", () => {
  const creados: string[] = [];
  let A: Awaited<ReturnType<typeof negocioSeed>>;

  beforeAll(async () => {
    A = await negocioSeed("la-esquina");
  });

  afterAll(async () => {
    await borrarPedidos(creados);
    await db.$disconnect();
  });

  async function nuevo(fulfillment: "PICKUP" | "DELIVERY" = "PICKUP") {
    const pedido = await crearPedidoDePrueba(A.id, fulfillment);
    creados.push(pedido.id);
    return pedido;
  }

  describe("CA-03: los importes guardados coinciden con el cálculo", () => {
    it("en todos los pedidos del seed: línea = cantidad × (precio + opciones), subtotal = líneas, total = subtotal + envío", async () => {
      const pedidos = await db.order.findMany({ include: { items: { include: { options: true } } } });
      expect(pedidos.length).toBeGreaterThanOrEqual(80);
      for (const p of pedidos) {
        for (const item of p.items) {
          const opciones = item.options.reduce((s, o) => s + o.priceDeltaCents, 0);
          expect(item.optionsTotalCents).toBe(opciones);
          expect(item.lineTotalCents).toBe(item.quantity * (item.unitPriceCents + item.optionsTotalCents));
        }
        expect(p.subtotalCents).toBe(p.items.reduce((s, i) => s + i.lineTotalCents, 0));
        expect(p.totalCents).toBe(p.subtotalCents + p.deliveryFeeCents);
        if (p.fulfillment === "PICKUP") expect(p.deliveryFeeCents).toBe(0);
      }
    });

    it("la base rechaza un total que no cuadra", async () => {
      const pedido = await nuevo();
      await expect(db.order.update({ where: { id: pedido.id }, data: { totalCents: pedido.totalCents + 1 } })).rejects.toThrow();
    });

    it("CA-06: cambiar el precio de un producto no cambia pedidos existentes", async () => {
      const pedido = await nuevo();
      const item = await db.orderItem.findFirstOrThrow({ where: { orderId: pedido.id, productId: { not: null } } });
      const producto = await db.product.findUniqueOrThrow({ where: { id: item.productId! } });
      await db.product.update({ where: { id: producto.id }, data: { priceCents: producto.priceCents + 100_000 } });
      try {
        const despues = await db.order.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } });
        expect(despues.totalCents).toBe(pedido.totalCents);
        expect(despues.items.find((i) => i.id === item.id)!.unitPriceCents).toBe(item.unitPriceCents);
      } finally {
        await db.product.update({ where: { id: producto.id }, data: { priceCents: producto.priceCents } });
      }
    });
  });

  describe("CA-05: transiciones", () => {
    it("cada transición válida deja una fila en el historial, con usuario y estado anterior", async () => {
      const staff = await sesionDe("la-esquina", "STAFF");
      const pedido = await nuevo("DELIVERY");
      const camino = ["CONFIRMED", "PREPARING", "READY", "ON_THE_WAY", "DELIVERED"] as const;
      let anterior: (typeof camino)[number] | "PENDING" = "PENDING";
      for (const estado of camino) {
        await cambiarEstado(staff, pedido.id, {
          toStatus: estado,
          expectedStatus: anterior,
          estimatedMinutes: estado === "CONFIRMED" ? 30 : undefined,
        });
        anterior = estado;
      }

      const final = await db.order.findUniqueOrThrow({ where: { id: pedido.id }, include: { statusHistory: { orderBy: { createdAt: "asc" } } } });
      expect(final.status).toBe("DELIVERED");
      expect(final.estimatedMinutes).toBe(30);
      expect(final.confirmedAt && final.readyAt && final.deliveredAt).toBeTruthy();
      expect(final.statusHistory.map((h) => [h.fromStatus, h.toStatus])).toEqual([
        [null, "PENDING"],
        ["PENDING", "CONFIRMED"],
        ["CONFIRMED", "PREPARING"],
        ["PREPARING", "READY"],
        ["READY", "ON_THE_WAY"],
        ["ON_THE_WAY", "DELIVERED"],
      ]);
      expect(final.statusHistory.slice(1).every((h) => h.userId === staff.userId)).toBe(true);
    });

    it("una transición inválida se rechaza y no deja historial", async () => {
      const staff = await sesionDe("la-esquina", "STAFF");
      const pedido = await nuevo();
      await expect(cambiarEstado(staff, pedido.id, { toStatus: "READY", expectedStatus: "PENDING" })).rejects.toMatchObject({
        code: "INVALID_TRANSITION",
      });
      // Retiro: nunca pasa por "en camino".
      await cambiarEstado(staff, pedido.id, { toStatus: "CONFIRMED", expectedStatus: "PENDING" });
      await cambiarEstado(staff, pedido.id, { toStatus: "PREPARING", expectedStatus: "CONFIRMED" });
      await cambiarEstado(staff, pedido.id, { toStatus: "READY", expectedStatus: "PREPARING" });
      await expect(cambiarEstado(staff, pedido.id, { toStatus: "ON_THE_WAY", expectedStatus: "READY" })).rejects.toMatchObject({
        code: "INVALID_TRANSITION",
      });
      expect(await db.orderStatusHistory.count({ where: { orderId: pedido.id } })).toBe(4);
    });

    it("cancelar exige motivo y lo guarda con auditoría; después el pedido no cambia más (RN-14)", async () => {
      const staff = await sesionDe("la-esquina", "STAFF");
      const pedido = await nuevo();
      await expect(cambiarEstado(staff, pedido.id, { toStatus: "CANCELLED", expectedStatus: "PENDING" })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
      await cambiarEstado(staff, pedido.id, {
        toStatus: "CANCELLED",
        expectedStatus: "PENDING",
        cancelReason: "OUT_OF_STOCK",
        reason: "Se terminó la milanesa",
      });
      const cancelado = await db.order.findUniqueOrThrow({ where: { id: pedido.id } });
      expect([cancelado.status, cancelado.cancelReason, cancelado.cancelNote]).toEqual(["CANCELLED", "OUT_OF_STOCK", "Se terminó la milanesa"]);
      expect(cancelado.cancelledAt).toBeTruthy();
      expect(await db.auditLog.count({ where: { entityId: pedido.id, action: "order.cancelled" } })).toBe(1);

      await expect(cambiarEstado(staff, pedido.id, { toStatus: "CONFIRMED", expectedStatus: "CANCELLED" })).rejects.toMatchObject({
        code: "INVALID_TRANSITION",
      });
    });

    it("STAFF no retrocede; un encargado sí, con motivo, y se borra la marca del estado que deja", async () => {
      const staff = await sesionDe("la-esquina", "STAFF");
      const manager = await sesionDe("la-esquina", "MANAGER");
      const pedido = await nuevo();
      await cambiarEstado(staff, pedido.id, { toStatus: "CONFIRMED", expectedStatus: "PENDING" });
      await cambiarEstado(staff, pedido.id, { toStatus: "PREPARING", expectedStatus: "CONFIRMED" });
      await cambiarEstado(staff, pedido.id, { toStatus: "READY", expectedStatus: "PREPARING" });

      await expect(
        cambiarEstado(staff, pedido.id, { toStatus: "PREPARING", expectedStatus: "READY", reason: "me equivoqué" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(cambiarEstado(manager, pedido.id, { toStatus: "PREPARING", expectedStatus: "READY" })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
      await cambiarEstado(manager, pedido.id, { toStatus: "PREPARING", expectedStatus: "READY", reason: "me equivoqué" });

      const corregido = await db.order.findUniqueOrThrow({ where: { id: pedido.id } });
      expect(corregido.status).toBe("PREPARING");
      expect(corregido.readyAt).toBeNull();
      expect(await db.auditLog.count({ where: { entityId: pedido.id, action: "order.status_reverted" } })).toBe(1);
    });

    it("dos usuarios confirman a la vez: uno gana y el otro recibe STATUS_CONFLICT", async () => {
      const staff = await sesionDe("la-esquina", "STAFF");
      const owner = await sesionDe("la-esquina", "OWNER");
      const pedido = await nuevo();
      const resultados = await Promise.allSettled([
        cambiarEstado(staff, pedido.id, { toStatus: "CONFIRMED", expectedStatus: "PENDING" }),
        cambiarEstado(owner, pedido.id, { toStatus: "CONFIRMED", expectedStatus: "PENDING" }),
      ]);
      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rechazo = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(rechazo.reason).toMatchObject({ code: "STATUS_CONFLICT" });
      expect(await db.orderStatusHistory.count({ where: { orderId: pedido.id, toStatus: "CONFIRMED" } })).toBe(1);
    });

    it("un estado esperado viejo responde STATUS_CONFLICT", async () => {
      const staff = await sesionDe("la-esquina", "STAFF");
      const pedido = await nuevo();
      await cambiarEstado(staff, pedido.id, { toStatus: "CONFIRMED", expectedStatus: "PENDING" });
      await expect(cambiarEstado(staff, pedido.id, { toStatus: "CONFIRMED", expectedStatus: "PENDING" })).rejects.toMatchObject({
        code: "STATUS_CONFLICT",
      });
    });
  });
});
