import "server-only";
import { revalidateTag } from "next/cache";
import { db, type Tx } from "@/lib/bd";
import { AppError, noEncontrado } from "@/lib/errores";
import { esUuid } from "@/lib/ids";
import { registrarAuditoria } from "@/modulos/auditoria";
import { puede, type Permiso } from "@/modulos/autenticacion/permisos";
import type { UsuarioSesion } from "@/modulos/autenticacion";
import type { NegocioId } from "@/modulos/negocio/alcance";
import type { GrupoDatos, ProductoCambiosDatos, ProductoDatos } from "./esquemas";
import { etiquetaMenu } from "./publico";

/**
 * Administración del menú desde el panel (Fase 6a, RF-030 a RF-033). Cada escritura:
 * verifica el permiso del rol, trabaja solo sobre el negocio de la sesión, deja registro en la
 * auditoría (RN-19), sube `menu_version` (los carritos abiertos se revalidan) e invalida la caché
 * del menú público para que el cambio se vea enseguida.
 */

function exigir(sesion: UsuarioSesion, permiso: Permiso) {
  if (!puede(sesion.role, permiso)) throw new AppError("FORBIDDEN", "No tenés permiso para hacer esto.");
}

/** Transacción de un cambio de menú: sube la versión y, al terminar bien, invalida la caché. */
async function cambiarMenu<T>(businessId: NegocioId, cambio: (tx: Tx) => Promise<T>): Promise<T> {
  const { resultado, slug } = await db.$transaction(async (tx) => {
    const resultado = await cambio(tx);
    const negocio = await tx.business.update({
      where: { id: businessId },
      data: { menuVersion: { increment: 1 } },
      select: { slug: true },
    });
    return { resultado, slug: negocio.slug };
  });
  // expire 0: el próximo pedido del menú ya trae los datos nuevos (un "agotado" se ve enseguida).
  revalidateTag(etiquetaMenu(slug), { expire: 0 });
  return resultado;
}

const campoInvalido = (campo: string, mensaje: string) => new AppError("VALIDATION_ERROR", "Revisá los datos.", { fields: { [campo]: mensaje } });

// ---------------------------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------------------------

/** Menú completo para el panel: incluye inactivos y agotados, no lo archivado. */
export async function listarMenuAdmin(sesion: UsuarioSesion) {
  exigir(sesion, "pedidos.ver");
  const businessId = sesion.businessId;
  const [categorias, grupos] = await Promise.all([
    db.category.findMany({
      where: { businessId, archivedAt: null },
      orderBy: { position: "asc" },
      include: {
        products: {
          where: { archivedAt: null },
          orderBy: { position: "asc" },
          include: { optionGroups: { orderBy: { position: "asc" }, select: { groupId: true } } },
        },
      },
    }),
    listarGrupos(sesion),
  ]);
  return { categorias, grupos };
}

export async function listarGrupos(sesion: UsuarioSesion) {
  exigir(sesion, "pedidos.ver");
  return db.optionGroup.findMany({
    where: { businessId: sesion.businessId, archivedAt: null },
    orderBy: { name: "asc" },
    include: {
      options: { where: { archivedAt: null }, orderBy: { position: "asc" } },
      _count: { select: { products: { where: { product: { archivedAt: null } } } } },
    },
  });
}

export async function obtenerProductoAdmin(sesion: UsuarioSesion, productId: string) {
  exigir(sesion, "pedidos.ver");
  if (!esUuid(productId)) return null;
  return db.product.findFirst({
    where: { id: productId, businessId: sesion.businessId, archivedAt: null },
    include: { optionGroups: { orderBy: { position: "asc" }, select: { groupId: true } } },
  });
}

// ---------------------------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------------------------

async function categoriaDelNegocio(cliente: Tx, businessId: NegocioId, id: string) {
  const categoria = esUuid(id) ? await cliente.category.findFirst({ where: { id, businessId, archivedAt: null } }) : null;
  if (!categoria) throw noEncontrado("No encontramos esta categoría.");
  return categoria;
}

export async function crearCategoria(sesion: UsuarioSesion, datos: { name: string }) {
  exigir(sesion, "menu.editar");
  const { businessId } = sesion;
  return cambiarMenu(businessId, async (tx) => {
    const ultima = await tx.category.aggregate({ where: { businessId, archivedAt: null }, _max: { position: true } });
    const categoria = await tx.category.create({ data: { businessId, name: datos.name, position: (ultima._max.position ?? -1) + 1 } });
    await registrarAuditoria(tx, { businessId, userId: sesion.userId, action: "category.created", entityType: "category", entityId: categoria.id, after: categoria });
    return categoria;
  });
}

export async function editarCategoria(sesion: UsuarioSesion, id: string, cambios: { name?: string; isActive?: boolean }) {
  exigir(sesion, "menu.editar");
  const { businessId } = sesion;
  return cambiarMenu(businessId, async (tx) => {
    const antes = await categoriaDelNegocio(tx, businessId, id);
    const despues = await tx.category.update({ where: { id: antes.id }, data: cambios });
    await registrarAuditoria(tx, { businessId, userId: sesion.userId, action: "category.updated", entityType: "category", entityId: id, before: antes, after: despues });
    return despues;
  });
}

/** Archiva la categoría y sus productos (no se borra nada: los pedidos conservan su copia). */
export async function archivarCategoria(sesion: UsuarioSesion, id: string) {
  exigir(sesion, "menu.editar");
  const { businessId } = sesion;
  return cambiarMenu(businessId, async (tx) => {
    const categoria = await categoriaDelNegocio(tx, businessId, id);
    const ahora = new Date();
    const { count } = await tx.product.updateMany({ where: { businessId, categoryId: id, archivedAt: null }, data: { archivedAt: ahora } });
    await tx.category.update({ where: { id }, data: { archivedAt: ahora } });
    await registrarAuditoria(tx, {
      businessId,
      userId: sesion.userId,
      action: "category.archived",
      entityType: "category",
      entityId: id,
      before: { name: categoria.name },
      after: { productosArchivados: count },
    });
  });
}

/** Recibe la lista completa de categorías en el orden nuevo. */
export async function reordenarCategorias(sesion: UsuarioSesion, ids: string[]) {
  exigir(sesion, "menu.editar");
  const { businessId } = sesion;
  return cambiarMenu(businessId, async (tx) => {
    const actuales = await tx.category.findMany({ where: { businessId, archivedAt: null }, select: { id: true } });
    if (!mismoConjunto(actuales.map((c) => c.id), ids)) throw campoInvalido("ids", "La lista tiene que incluir todas las categorías, una vez cada una.");
    for (const [position, id] of ids.entries()) await tx.category.update({ where: { id }, data: { position } });
    await registrarAuditoria(tx, { businessId, userId: sesion.userId, action: "category.reordered", entityType: "category", after: { ids } });
  });
}

function mismoConjunto(a: string[], b: string[]) {
  return a.length === b.length && new Set(b).size === b.length && b.every((x) => a.includes(x));
}

// ---------------------------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------------------------

async function productoDelNegocio(cliente: Tx, businessId: NegocioId, id: string) {
  const producto = esUuid(id)
    ? await cliente.product.findFirst({
        where: { id, businessId, archivedAt: null },
        include: { optionGroups: { orderBy: { position: "asc" }, select: { groupId: true } } },
      })
    : null;
  if (!producto) throw noEncontrado("No encontramos este producto.");
  return producto;
}

/** Los grupos tienen que ser del negocio y estar vigentes. */
async function validarGrupos(tx: Tx, businessId: NegocioId, groupIds: string[]) {
  if (new Set(groupIds).size !== groupIds.length) throw campoInvalido("groupIds", "Hay grupos repetidos.");
  const encontrados = await tx.optionGroup.count({ where: { businessId, archivedAt: null, id: { in: groupIds } } });
  if (encontrados !== groupIds.length) throw campoInvalido("groupIds", "Algún grupo de opciones no existe.");
}

async function validarCategoria(tx: Tx, businessId: NegocioId, categoryId: string) {
  const existe = await tx.category.findFirst({ where: { id: categoryId, businessId, archivedAt: null }, select: { id: true } });
  if (!existe) throw campoInvalido("categoryId", "Elegí una categoría.");
}

const resumenProducto = (p: { name: string; priceCents: number; categoryId: string; isActive: boolean; isSoldOut: boolean; description: string | null; imageUrl: string | null; tags: string[] }, groupIds: string[]) => ({
  name: p.name,
  priceCents: p.priceCents,
  categoryId: p.categoryId,
  isActive: p.isActive,
  isSoldOut: p.isSoldOut,
  description: p.description,
  imageUrl: p.imageUrl,
  tags: p.tags,
  groupIds,
});

export async function crearProducto(sesion: UsuarioSesion, datos: ProductoDatos) {
  exigir(sesion, "menu.editar");
  const { businessId } = sesion;
  return cambiarMenu(businessId, async (tx) => {
    await validarCategoria(tx, businessId, datos.categoryId);
    await validarGrupos(tx, businessId, datos.groupIds);
    const ultima = await tx.product.aggregate({ where: { businessId, categoryId: datos.categoryId, archivedAt: null }, _max: { position: true } });
    const { groupIds, ...campos } = datos;
    const producto = await tx.product.create({
      data: {
        ...campos,
        businessId,
        position: (ultima._max.position ?? -1) + 1,
        optionGroups: { create: groupIds.map((groupId, position) => ({ groupId, position })) },
      },
    });
    await registrarAuditoria(tx, { businessId, userId: sesion.userId, action: "product.created", entityType: "product", entityId: producto.id, after: resumenProducto(producto, groupIds) });
    return producto;
  });
}

export async function editarProducto(sesion: UsuarioSesion, id: string, cambios: ProductoCambiosDatos) {
  exigir(sesion, "menu.editar");
  const { businessId } = sesion;
  return cambiarMenu(businessId, async (tx) => {
    const antes = await productoDelNegocio(tx, businessId, id);
    const { expectedUpdatedAt, groupIds, ...campos } = cambios;
    if (antes.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new AppError("EDIT_CONFLICT", "Otro usuario cambió este producto. Recargá para ver los cambios.");
    }
    if (campos.categoryId) await validarCategoria(tx, businessId, campos.categoryId);
    if (groupIds) {
      await validarGrupos(tx, businessId, groupIds);
      await tx.productOptionGroup.deleteMany({ where: { businessId, productId: id } });
      await tx.productOptionGroup.createMany({ data: groupIds.map((groupId, position) => ({ businessId, productId: id, groupId, position })) });
    }
    // Si cambia de categoría, va al final de la nueva.
    let position: number | undefined;
    if (campos.categoryId && campos.categoryId !== antes.categoryId) {
      const ultima = await tx.product.aggregate({ where: { businessId, categoryId: campos.categoryId, archivedAt: null }, _max: { position: true } });
      position = (ultima._max.position ?? -1) + 1;
    }
    const despues = await tx.product.update({ where: { id }, data: { ...campos, ...(position !== undefined && { position }) } });
    const gruposAntes = antes.optionGroups.map((g) => g.groupId);
    await registrarAuditoria(tx, {
      businessId,
      userId: sesion.userId,
      action: antes.priceCents !== despues.priceCents ? "product.price_changed" : "product.updated",
      entityType: "product",
      entityId: id,
      before: resumenProducto(antes, gruposAntes),
      after: resumenProducto(despues, groupIds ?? gruposAntes),
    });
    return despues;
  });
}

export async function archivarProducto(sesion: UsuarioSesion, id: string) {
  exigir(sesion, "menu.editar");
  const { businessId } = sesion;
  return cambiarMenu(businessId, async (tx) => {
    const producto = await productoDelNegocio(tx, businessId, id);
    await tx.product.update({ where: { id }, data: { archivedAt: new Date() } });
    await registrarAuditoria(tx, { businessId, userId: sesion.userId, action: "product.archived", entityType: "product", entityId: id, before: { name: producto.name } });
  });
}

/** Activo/visible o agotado, en un toque. Lo puede hacer el personal (RF-032). */
export async function cambiarDisponibilidad(sesion: UsuarioSesion, id: string, cambio: { isActive: boolean } | { isSoldOut: boolean }) {
  exigir(sesion, "productos.disponibilidad");
  const { businessId } = sesion;
  return cambiarMenu(businessId, async (tx) => {
    const antes = await productoDelNegocio(tx, businessId, id);
    const despues = await tx.product.update({ where: { id }, data: cambio });
    await registrarAuditoria(tx, {
      businessId,
      userId: sesion.userId,
      action: "isSoldOut" in cambio ? "product.sold_out_changed" : "product.visibility_changed",
      entityType: "product",
      entityId: id,
      before: { isActive: antes.isActive, isSoldOut: antes.isSoldOut },
      after: { isActive: despues.isActive, isSoldOut: despues.isSoldOut },
    });
    return despues;
  });
}

/** Lista completa de productos de una categoría en el orden nuevo. */
export async function reordenarProductos(sesion: UsuarioSesion, categoryId: string, ids: string[]) {
  exigir(sesion, "menu.editar");
  const { businessId } = sesion;
  return cambiarMenu(businessId, async (tx) => {
    await categoriaDelNegocio(tx, businessId, categoryId);
    const actuales = await tx.product.findMany({ where: { businessId, categoryId, archivedAt: null }, select: { id: true } });
    if (!mismoConjunto(actuales.map((p) => p.id), ids)) throw campoInvalido("ids", "La lista tiene que incluir todos los productos de la categoría.");
    for (const [position, id] of ids.entries()) await tx.product.update({ where: { id }, data: { position } });
    await registrarAuditoria(tx, { businessId, userId: sesion.userId, action: "product.reordered", entityType: "category", entityId: categoryId, after: { ids } });
  });
}

// ---------------------------------------------------------------------------------------------
// Grupos de opciones (reutilizables entre productos, RF-033)
// ---------------------------------------------------------------------------------------------

const normalizarOpciones = (datos: GrupoDatos) =>
  datos.options.map((o, position) => ({ ...o, position, priceDeltaCents: datos.kind === "REMOVE" ? 0 : o.priceDeltaCents }));

export async function crearGrupo(sesion: UsuarioSesion, datos: GrupoDatos) {
  exigir(sesion, "menu.editar");
  const { businessId } = sesion;
  if (datos.options.some((o) => o.id)) throw campoInvalido("options", "Un grupo nuevo no puede traer opciones existentes.");
  return cambiarMenu(businessId, async (tx) => {
    const grupo = await tx.optionGroup.create({
      data: {
        businessId,
        name: datos.name,
        kind: datos.kind,
        minSelect: datos.minSelect,
        maxSelect: datos.maxSelect,
        options: { create: normalizarOpciones(datos).map((o) => ({ name: o.name, priceDeltaCents: o.priceDeltaCents, isAvailable: o.isAvailable, position: o.position })) },
      },
      include: { options: true },
    });
    await registrarAuditoria(tx, { businessId, userId: sesion.userId, action: "option_group.created", entityType: "option_group", entityId: grupo.id, after: grupo });
    return grupo;
  });
}

/**
 * Reemplaza el grupo con la lista recibida: las opciones con id se actualizan, las nuevas se crean y
 * las que no vinieron se archivan (los pedidos viejos conservan su copia).
 */
export async function editarGrupo(sesion: UsuarioSesion, id: string, datos: GrupoDatos) {
  exigir(sesion, "menu.editar");
  const { businessId } = sesion;
  return cambiarMenu(businessId, async (tx) => {
    const antes = esUuid(id)
      ? await tx.optionGroup.findFirst({ where: { id, businessId, archivedAt: null }, include: { options: { where: { archivedAt: null } } } })
      : null;
    if (!antes) throw noEncontrado("No encontramos este grupo de opciones.");

    const existentes = new Set(antes.options.map((o) => o.id));
    const recibidas = datos.options.filter((o) => o.id);
    if (recibidas.some((o) => !existentes.has(o.id!))) throw campoInvalido("options", "Alguna opción no pertenece a este grupo.");

    await tx.optionGroup.update({ where: { id }, data: { name: datos.name, kind: datos.kind, minSelect: datos.minSelect, maxSelect: datos.maxSelect } });
    const ahora = new Date();
    await tx.option.updateMany({
      where: { businessId, groupId: id, archivedAt: null, id: { notIn: recibidas.map((o) => o.id!) } },
      data: { archivedAt: ahora },
    });
    for (const { id: opcionId, ...o } of normalizarOpciones(datos)) {
      if (opcionId) await tx.option.update({ where: { id: opcionId }, data: o });
      else await tx.option.create({ data: { ...o, businessId, groupId: id } });
    }
    const despues = await tx.optionGroup.findUniqueOrThrow({ where: { id }, include: { options: { where: { archivedAt: null }, orderBy: { position: "asc" } } } });
    await registrarAuditoria(tx, { businessId, userId: sesion.userId, action: "option_group.updated", entityType: "option_group", entityId: id, before: antes, after: despues });
    return despues;
  });
}

export async function archivarGrupo(sesion: UsuarioSesion, id: string) {
  exigir(sesion, "menu.editar");
  const { businessId } = sesion;
  return cambiarMenu(businessId, async (tx) => {
    const grupo = esUuid(id) ? await tx.optionGroup.findFirst({ where: { id, businessId, archivedAt: null } }) : null;
    if (!grupo) throw noEncontrado("No encontramos este grupo de opciones.");
    await tx.optionGroup.update({ where: { id }, data: { archivedAt: new Date() } });
    await registrarAuditoria(tx, { businessId, userId: sesion.userId, action: "option_group.archived", entityType: "option_group", entityId: id, before: { name: grupo.name } });
  });
}
