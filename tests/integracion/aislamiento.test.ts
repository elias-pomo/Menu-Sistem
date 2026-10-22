import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/bd";
import { cargarProductosParaPedido, listarCategorias, obtenerProducto } from "@/modulos/menu";
import { cambiarEstado, listarPedidosActivos, obtenerPedido } from "@/modulos/pedidos";
import { borrarPedidos, crearPedidoDePrueba, hayBase, negocioSeed, sesionDe } from "./ayudantes";

/**
 * CA-04 / RNF-009: con los dos negocios del seed, ningún intento de leer, modificar o referenciar
 * datos del otro negocio funciona, ni por la capa de repositorio ni directo contra la base.
 */
// El trigger usa el código foreign_key_violation; Prisma lo informa con su propio mensaje.
const RECHAZO_TRIGGER = /no pertenece al negocio|Foreign key constraint/;

describe.skipIf(!hayBase)("aislamiento entre negocios (integración)", () => {
  let A: Awaited<ReturnType<typeof negocioSeed>>;
  let B: Awaited<ReturnType<typeof negocioSeed>>;
  let pedidoDeB: Awaited<ReturnType<typeof crearPedidoDePrueba>>;
  const creados: string[] = [];

  beforeAll(async () => {
    A = await negocioSeed("la-esquina");
    B = await negocioSeed("don-pepe");
    pedidoDeB = await crearPedidoDePrueba(B.id);
    creados.push(pedidoDeB.id);
  });

  afterAll(async () => {
    await borrarPedidos(creados);
    await db.$disconnect();
  });

  it("el repositorio de A no encuentra un pedido de B por su ID", async () => {
    expect(await obtenerPedido(db, A.id, pedidoDeB.id)).toBeNull();
    expect(await obtenerPedido(db, B.id, pedidoDeB.id)).not.toBeNull();
  });

  it("los pedidos activos de A no incluyen ninguno de B", async () => {
    const activos = await listarPedidosActivos(db, A.id);
    expect(activos.length).toBeGreaterThan(0);
    expect(activos.every((p) => p.businessId === A.id)).toBe(true);
  });

  it("A no puede leer productos de B, ni usarlos para calcular un pedido", async () => {
    const productoDeB = await db.product.findFirstOrThrow({ where: { businessId: B.id } });
    expect(await obtenerProducto(db, A.id, productoDeB.id)).toBeNull();
    const menu = await cargarProductosParaPedido(db, A.id, [productoDeB.id]);
    expect(menu.size).toBe(0);
  });

  it("las categorías de A son solo de A", async () => {
    const categorias = await listarCategorias(db, A.id);
    expect(categorias.length).toBeGreaterThan(0);
    expect(categorias.every((c) => c.businessId === A.id)).toBe(true);
  });

  it("un usuario de A que cambia el estado de un pedido de B recibe 404 y el pedido no cambia", async () => {
    for (const role of ["STAFF", "MANAGER", "OWNER"] as const) {
      const sesion = await sesionDe("la-esquina", role);
      await expect(cambiarEstado(sesion, pedidoDeB.id, { toStatus: "CONFIRMED", expectedStatus: "PENDING" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    }
    const intacto = await db.order.findUniqueOrThrow({ where: { id: pedidoDeB.id } });
    expect(intacto.status).toBe("PENDING");
  });

  it("un ID que no es UUID se trata igual que uno inexistente", async () => {
    expect(await obtenerPedido(db, A.id, "1 OR 1=1")).toBeNull();
    expect(await obtenerProducto(db, A.id, "../../etc")).toBeNull();
  });

  describe("la base rechaza referencias cruzadas aunque el código fallara", () => {
    it("producto de A en una categoría de B (FK compuesta)", async () => {
      const categoriaDeB = await db.category.findFirstOrThrow({ where: { businessId: B.id } });
      await expect(
        db.product.create({ data: { businessId: A.id, categoryId: categoriaDeB.id, name: "Intruso", priceCents: 100 } }),
      ).rejects.toThrow();
    });

    it("opción de A en un grupo de B (FK compuesta)", async () => {
      const grupoDeB = await db.optionGroup.findFirstOrThrow({ where: { businessId: B.id } });
      await expect(db.option.create({ data: { businessId: A.id, groupId: grupoDeB.id, name: "Intrusa" } })).rejects.toThrow();
    });

    it("ítem de un pedido de B marcado como del negocio A (FK compuesta)", async () => {
      await expect(
        db.orderItem.create({
          data: {
            businessId: A.id,
            orderId: pedidoDeB.id,
            productName: "x",
            categoryName: "x",
            unitPriceCents: 0,
            optionsTotalCents: 0,
            quantity: 1,
            lineTotalCents: 0,
          },
        }),
      ).rejects.toThrow();
    });

    it("ítem de B que referencia un producto de A (trigger de referencia opcional)", async () => {
      const productoDeA = await db.product.findFirstOrThrow({ where: { businessId: A.id } });
      await expect(
        db.orderItem.create({
          data: {
            businessId: B.id,
            orderId: pedidoDeB.id,
            productId: productoDeA.id,
            productName: "x",
            categoryName: "x",
            unitPriceCents: 0,
            optionsTotalCents: 0,
            quantity: 1,
            lineTotalCents: 0,
          },
        }),
      ).rejects.toThrow(RECHAZO_TRIGGER);
    });

    it("historial de un pedido de B firmado por un usuario de A (trigger)", async () => {
      const usuarioDeA = await db.appUser.findFirstOrThrow({ where: { businessId: A.id } });
      await expect(
        db.orderStatusHistory.create({
          data: { businessId: B.id, orderId: pedidoDeB.id, toStatus: "CONFIRMED", userId: usuarioDeA.id },
        }),
      ).rejects.toThrow(RECHAZO_TRIGGER);
    });

    it("pedido de B marcado como cobrado por un usuario de A (trigger)", async () => {
      const usuarioDeA = await db.appUser.findFirstOrThrow({ where: { businessId: A.id } });
      await expect(
        db.order.update({ where: { id: pedidoDeB.id }, data: { paidAt: new Date(), paidBy: usuarioDeA.id } }),
      ).rejects.toThrow(RECHAZO_TRIGGER);
    });

    it("auditoría de B atribuida a un usuario de A (trigger)", async () => {
      const usuarioDeA = await db.appUser.findFirstOrThrow({ where: { businessId: A.id } });
      await expect(
        db.auditLog.create({ data: { businessId: B.id, userId: usuarioDeA.id, action: "x", entityType: "x" } }),
      ).rejects.toThrow(RECHAZO_TRIGGER);
    });
  });
});
