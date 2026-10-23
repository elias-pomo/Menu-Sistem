import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/bd";
import {
  archivarCategoria,
  archivarGrupo,
  archivarProducto,
  cambiarDisponibilidad,
  cargarProductosParaPedido,
  crearCategoria,
  crearGrupo,
  crearProducto,
  editarGrupo,
  editarProducto,
  obtenerMenuPublico,
  reordenarCategorias,
  reordenarProductos,
} from "@/modulos/menu";
import { hayBase, negocioSeed, sesionDe } from "./ayudantes";

/** Administración del menú (Fase 6a) contra la base local con el seed. */
describe.skipIf(!hayBase)("administración del menú (integración)", () => {
  const categorias: string[] = [];
  const grupos: string[] = [];
  const productos: string[] = [];
  let A: Awaited<ReturnType<typeof negocioSeed>>;
  let B: Awaited<ReturnType<typeof negocioSeed>>;

  beforeAll(async () => {
    A = await negocioSeed("la-esquina");
    B = await negocioSeed("don-pepe");
  });

  afterAll(async () => {
    const ids = [...categorias, ...grupos, ...productos];
    await db.$transaction([
      db.auditLog.deleteMany({ where: { entityId: { in: ids } } }),
      db.auditLog.deleteMany({ where: { action: { in: ["category.reordered", "product.reordered"] }, createdAt: { gt: new Date(Date.now() - 3_600_000) } } }),
      db.productOptionGroup.deleteMany({ where: { productId: { in: productos } } }),
      db.product.deleteMany({ where: { id: { in: productos } } }),
      db.option.deleteMany({ where: { groupId: { in: grupos } } }),
      db.optionGroup.deleteMany({ where: { id: { in: grupos } } }),
      db.product.deleteMany({ where: { categoryId: { in: categorias } } }),
      db.category.deleteMany({ where: { id: { in: categorias } } }),
    ]);
    await db.$disconnect();
  });

  const version = async () => (await db.business.findUniqueOrThrow({ where: { id: A.id } })).menuVersion;

  async function categoriaDePrueba() {
    const manager = await sesionDe("la-esquina", "MANAGER");
    const c = await crearCategoria(manager, { name: `Test ${Date.now()}` });
    categorias.push(c.id);
    return c;
  }

  async function grupoDePrueba(kind: "CHOICE" | "REMOVE" = "CHOICE") {
    const manager = await sesionDe("la-esquina", "MANAGER");
    const g = await crearGrupo(manager, {
      name: `Tamaño test ${Date.now()}`,
      kind,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: "Simple", priceDeltaCents: 0, isAvailable: true },
        { name: "Doble", priceDeltaCents: 150_000, isAvailable: true },
      ],
    });
    grupos.push(g.id);
    return g;
  }

  async function productoDePrueba(categoryId: string, groupIds: string[] = []) {
    const manager = await sesionDe("la-esquina", "MANAGER");
    const p = await crearProducto(manager, {
      categoryId,
      name: `Producto test ${Date.now()}`,
      description: null,
      priceCents: 850_000,
      imageUrl: null,
      tags: [],
      groupIds,
    });
    productos.push(p.id);
    return p;
  }

  it("un encargado crea categoría, grupo y producto; cada cambio sube la versión del menú y queda auditado", async () => {
    const v0 = await version();
    const categoria = await categoriaDePrueba();
    const grupo = await grupoDePrueba();
    const producto = await productoDePrueba(categoria.id, [grupo.id]);
    expect(await version()).toBe(v0 + 3);

    const auditoria = await db.auditLog.findMany({ where: { entityId: { in: [categoria.id, grupo.id, producto.id] } } });
    expect(auditoria.map((a) => a.action).sort()).toEqual(["category.created", "option_group.created", "product.created"]);

    // El producto ya sale en el menú público y se puede calcular con sus opciones.
    const menu = await cargarProductosParaPedido(db, A.id, [producto.id]);
    expect(menu.get(producto.id)?.groups[0].options.map((o) => o.name)).toEqual(["Simple", "Doble"]);
    const publico = await obtenerMenuPublico("la-esquina");
    expect(publico?.categories.find((c) => c.id === categoria.id)?.products[0].id).toBe(producto.id);
  });

  it("el personal no puede crear ni editar el menú, pero sí marcar agotado (RF-032)", async () => {
    const staff = await sesionDe("la-esquina", "STAFF");
    await expect(crearCategoria(staff, { name: "No" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const categoria = await categoriaDePrueba();
    const producto = await productoDePrueba(categoria.id);

    const agotado = await cambiarDisponibilidad(staff, producto.id, { isSoldOut: true });
    expect(agotado.isSoldOut).toBe(true);
    expect(await db.auditLog.count({ where: { entityId: producto.id, action: "product.sold_out_changed", userId: staff.userId } })).toBe(1);
    await expect(archivarProducto(staff, producto.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("no se puede tocar ni referenciar el menú de otro negocio", async () => {
    const managerA = await sesionDe("la-esquina", "MANAGER");
    const productoDeB = await db.product.findFirstOrThrow({ where: { businessId: B.id, archivedAt: null } });
    const categoriaDeB = await db.category.findFirstOrThrow({ where: { businessId: B.id } });
    const grupoDeB = await db.optionGroup.findFirstOrThrow({ where: { businessId: B.id } });

    await expect(cambiarDisponibilidad(managerA, productoDeB.id, { isSoldOut: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(archivarProducto(managerA, productoDeB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(archivarCategoria(managerA, categoriaDeB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(archivarGrupo(managerA, grupoDeB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      crearProducto(managerA, { categoryId: categoriaDeB.id, name: "Intruso", description: null, priceCents: 1, imageUrl: null, tags: [], groupIds: [] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", fields: { categoryId: expect.any(String) } });

    const categoria = await categoriaDePrueba();
    await expect(
      crearProducto(managerA, { categoryId: categoria.id, name: "Intruso", description: null, priceCents: 1, imageUrl: null, tags: [], groupIds: [grupoDeB.id] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", fields: { groupIds: expect.any(String) } });

    expect((await db.product.findUniqueOrThrow({ where: { id: productoDeB.id } })).isSoldOut).toBe(productoDeB.isSoldOut);
  });

  it("editar con una versión vieja da EDIT_CONFLICT; un cambio de precio queda auditado con antes y después", async () => {
    const manager = await sesionDe("la-esquina", "MANAGER");
    const categoria = await categoriaDePrueba();
    const producto = await productoDePrueba(categoria.id);

    const editado = await editarProducto(manager, producto.id, { priceCents: 900_000, expectedUpdatedAt: producto.updatedAt.toISOString() });
    expect(editado.priceCents).toBe(900_000);
    await expect(editarProducto(manager, producto.id, { name: "Otro", expectedUpdatedAt: producto.updatedAt.toISOString() })).rejects.toMatchObject({
      code: "EDIT_CONFLICT",
    });

    const registro = await db.auditLog.findFirstOrThrow({ where: { entityId: producto.id, action: "product.price_changed" } });
    expect(registro.before).toMatchObject({ priceCents: 850_000 });
    expect(registro.after).toMatchObject({ priceCents: 900_000 });
  });

  it("editar un grupo: actualiza, agrega y archiva opciones; las archivadas ya no se pueden pedir", async () => {
    const manager = await sesionDe("la-esquina", "MANAGER");
    const grupo = await grupoDePrueba();
    const [simple, doble] = grupo.options.sort((a, b) => a.position - b.position);
    const categoria = await categoriaDePrueba();
    const producto = await productoDePrueba(categoria.id, [grupo.id]);

    const editado = await editarGrupo(manager, grupo.id, {
      name: grupo.name,
      kind: "CHOICE",
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: simple.id, name: "Simple", priceDeltaCents: 0, isAvailable: true },
        { name: "Triple", priceDeltaCents: 250_000, isAvailable: true },
      ],
    });
    expect(editado.options.map((o) => o.name)).toEqual(["Simple", "Triple"]);
    expect((await db.option.findUniqueOrThrow({ where: { id: doble.id } })).archivedAt).not.toBeNull();

    const menu = await cargarProductosParaPedido(db, A.id, [producto.id]);
    expect(menu.get(producto.id)!.groups[0].options.map((o) => o.name)).toEqual(["Simple", "Triple"]);

    // Una opción de otro grupo no se puede colar en la edición.
    const ajena = await db.option.findFirstOrThrow({ where: { businessId: B.id } });
    await expect(
      editarGrupo(manager, grupo.id, { name: "x", kind: "CHOICE", minSelect: 0, maxSelect: 1, options: [{ id: ajena.id, name: "x", priceDeltaCents: 0, isAvailable: true }] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("en un grupo de ingredientes quitables nunca se cobra adicional", async () => {
    const grupo = await grupoDePrueba("REMOVE");
    expect(grupo.options.every((o) => o.priceDeltaCents === 0)).toBe(true);
  });

  it("archivar una categoría archiva sus productos y los saca del menú público", async () => {
    const manager = await sesionDe("la-esquina", "MANAGER");
    const categoria = await categoriaDePrueba();
    const producto = await productoDePrueba(categoria.id);
    await archivarCategoria(manager, categoria.id);
    expect((await db.product.findUniqueOrThrow({ where: { id: producto.id } })).archivedAt).not.toBeNull();
    const publico = await obtenerMenuPublico("la-esquina");
    expect(publico?.categories.some((c) => c.id === categoria.id)).toBe(false);
  });

  it("reordenar exige la lista completa y aplica el orden nuevo", async () => {
    const manager = await sesionDe("la-esquina", "MANAGER");
    const actuales = await db.category.findMany({ where: { businessId: A.id, archivedAt: null }, orderBy: { position: "asc" } });
    await expect(reordenarCategorias(manager, actuales.slice(1).map((c) => c.id))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const invertido = actuales.map((c) => c.id).reverse();
    await reordenarCategorias(manager, invertido);
    const despues = await db.category.findMany({ where: { businessId: A.id, archivedAt: null }, orderBy: { position: "asc" } });
    expect(despues.map((c) => c.id)).toEqual(invertido);
    await reordenarCategorias(manager, actuales.map((c) => c.id));

    const categoria = await categoriaDePrueba();
    const p1 = await productoDePrueba(categoria.id);
    const p2 = await productoDePrueba(categoria.id);
    await reordenarProductos(manager, categoria.id, [p2.id, p1.id]);
    const orden = await db.product.findMany({ where: { categoryId: categoria.id }, orderBy: { position: "asc" } });
    expect(orden.map((p) => p.id)).toEqual([p2.id, p1.id]);
  });
});
