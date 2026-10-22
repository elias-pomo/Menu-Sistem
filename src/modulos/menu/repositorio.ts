import "server-only";
import type { Db, Tx } from "@/lib/bd";
import { esUuid } from "@/lib/ids";
import type { NegocioId } from "@/modulos/negocio/alcance";
import type { ProductoMenu } from "@/modulos/pedidos/calculo";

/**
 * Acceso a datos del menú. Toda función exige el negocio y lo pone en el WHERE: una consulta por ID
 * de otro negocio no encuentra nada (y la ruta responde 404).
 */

/**
 * Productos pedidos, leídos frescos (nunca de la caché) con sus grupos y opciones, listos para el
 * cálculo. Los productos que no son del negocio simplemente no aparecen en el resultado.
 */
export async function cargarProductosParaPedido(
  cliente: Db | Tx,
  businessId: NegocioId,
  productIds: readonly string[],
): Promise<Map<string, ProductoMenu>> {
  const ids = [...new Set(productIds)].filter(esUuid);
  if (ids.length === 0) return new Map();

  const productos = await cliente.product.findMany({
    where: { businessId, id: { in: ids } },
    include: {
      category: true,
      optionGroups: {
        where: { group: { archivedAt: null } },
        orderBy: { position: "asc" },
        include: { group: { include: { options: { orderBy: { position: "asc" } } } } },
      },
    },
  });

  return new Map(
    productos.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        categoryName: p.category.name,
        priceCents: p.priceCents,
        isOrderable: p.isActive && !p.archivedAt && p.category.isActive && !p.category.archivedAt,
        isSoldOut: p.isSoldOut,
        groups: p.optionGroups.map(({ group }) => ({
          id: group.id,
          name: group.name,
          kind: group.kind,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          options: group.options.map((o) => ({
            id: o.id,
            name: o.name,
            priceDeltaCents: o.priceDeltaCents,
            isAvailable: o.isAvailable,
          })),
        })),
      },
    ]),
  );
}

export async function obtenerProducto(cliente: Db | Tx, businessId: NegocioId, productId: string) {
  if (!esUuid(productId)) return null;
  return cliente.product.findFirst({ where: { id: productId, businessId } });
}

export async function listarCategorias(cliente: Db | Tx, businessId: NegocioId) {
  return cliente.category.findMany({ where: { businessId, archivedAt: null }, orderBy: { position: "asc" } });
}
