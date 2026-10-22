import { assertCentavos, multiplicarCentavos, sumarCentavos, type Centavos } from "@/lib/dinero";

/**
 * Cálculo de un pedido (RN-02 a RN-09). Función pura: recibe el menú leído fresco de la base y el
 * carrito que mandó el navegador, y devuelve las líneas con la copia histórica y los totales, o los
 * problemas encontrados. De lo que manda el navegador solo se usan IDs, cantidades y notas; los
 * precios que traiga sirven únicamente para detectar que cambiaron (RN-03, RN-06).
 */

export type TipoGrupo = "CHOICE" | "REMOVE";
export type TipoEntrega = "PICKUP" | "DELIVERY";
export type MedioPago = "CASH" | "TRANSFER";

export type OpcionMenu = { id: string; name: string; priceDeltaCents: Centavos; isAvailable: boolean };

export type GrupoMenu = {
  id: string;
  name: string;
  kind: TipoGrupo;
  minSelect: number;
  maxSelect: number;
  options: OpcionMenu[];
};

export type ProductoMenu = {
  id: string;
  name: string;
  categoryName: string;
  priceCents: Centavos;
  /** Activo, no archivado y con la categoría activa. */
  isOrderable: boolean;
  isSoldOut: boolean;
  groups: GrupoMenu[];
};

export type ConfiguracionNegocio = {
  deliveryEnabled: boolean;
  deliveryFeeCents: Centavos;
  minOrderCents: Centavos;
  acceptCash: boolean;
  acceptTransfer: boolean;
};

export type ItemCarrito = {
  productId: string;
  quantity: number;
  optionIds: string[];
  note: string | null;
  /** Precio por unidad (base + opciones) que vio el cliente. Solo para detectar cambios. */
  expectedUnitCents?: Centavos;
};

export type CarritoPedido = {
  fulfillment: TipoEntrega;
  paymentMethod: MedioPago;
  items: ItemCarrito[];
};

export type OpcionCopiada = {
  optionId: string;
  groupName: string;
  optionName: string;
  kind: TipoGrupo;
  priceDeltaCents: Centavos;
};

export type LineaCalculada = {
  productId: string;
  productName: string;
  categoryName: string;
  unitPriceCents: Centavos;
  optionsTotalCents: Centavos;
  quantity: number;
  lineTotalCents: Centavos;
  note: string | null;
  position: number;
  options: OpcionCopiada[];
};

export type CambioMenu =
  | { productId: string; change: "UNAVAILABLE" | "SOLD_OUT" }
  | { productId: string; change: "OPTION_UNAVAILABLE"; optionId: string }
  | { productId: string; change: "PRICE"; oldCents: Centavos; newCents: Centavos };

export type ResultadoCalculo =
  | {
      ok: true;
      lines: LineaCalculada[];
      subtotalCents: Centavos;
      deliveryFeeCents: Centavos;
      totalCents: Centavos;
    }
  /** 400: el carrito no respeta las reglas del producto (opciones fuera de rango o ajenas). */
  | { ok: false; code: "VALIDATION_ERROR"; fields: Record<string, string> }
  /** 409: el menú cambió desde que se armó el carrito. */
  | { ok: false; code: "MENU_CHANGED"; details: CambioMenu[] }
  /** 422: regla del negocio. */
  | { ok: false; code: "DELIVERY_DISABLED" | "PAYMENT_METHOD_DISABLED" }
  | { ok: false; code: "MIN_ORDER_NOT_REACHED"; missingCents: Centavos };

export const LIMITES_PEDIDO = {
  minQuantity: 1,
  maxQuantity: 20,
  maxItems: 30,
  maxItemNote: 200,
  maxOrderNote: 300,
} as const;

export function calcularPedido(
  carrito: CarritoPedido,
  productos: ReadonlyMap<string, ProductoMenu>,
  negocio: ConfiguracionNegocio,
): ResultadoCalculo {
  if (carrito.fulfillment === "DELIVERY" && !negocio.deliveryEnabled) return { ok: false, code: "DELIVERY_DISABLED" };
  if (carrito.paymentMethod === "CASH" && !negocio.acceptCash) return { ok: false, code: "PAYMENT_METHOD_DISABLED" };
  if (carrito.paymentMethod === "TRANSFER" && !negocio.acceptTransfer) {
    return { ok: false, code: "PAYMENT_METHOD_DISABLED" };
  }

  const fields: Record<string, string> = {};
  const cambios: CambioMenu[] = [];
  const lines: LineaCalculada[] = [];

  if (carrito.items.length === 0) fields.items = "El pedido no tiene productos.";
  if (carrito.items.length > LIMITES_PEDIDO.maxItems) {
    fields.items = `El pedido puede tener hasta ${LIMITES_PEDIDO.maxItems} productos distintos.`;
  }

  carrito.items.forEach((item, position) => {
    const campo = `items.${position}`;
    const { quantity } = item;
    if (!Number.isInteger(quantity) || quantity < LIMITES_PEDIDO.minQuantity || quantity > LIMITES_PEDIDO.maxQuantity) {
      fields[`${campo}.quantity`] = `La cantidad tiene que estar entre ${LIMITES_PEDIDO.minQuantity} y ${LIMITES_PEDIDO.maxQuantity}.`;
      return;
    }
    if (item.note && item.note.length > LIMITES_PEDIDO.maxItemNote) {
      fields[`${campo}.note`] = `La nota puede tener hasta ${LIMITES_PEDIDO.maxItemNote} caracteres.`;
      return;
    }

    const producto = productos.get(item.productId);
    // Inexistente, archivado o de otro negocio se ve igual: "ya no está disponible" (RN-05).
    if (!producto || !producto.isOrderable) {
      cambios.push({ productId: item.productId, change: "UNAVAILABLE" });
      return;
    }
    if (producto.isSoldOut) {
      cambios.push({ productId: producto.id, change: "SOLD_OUT" });
      return;
    }

    const resultadoOpciones = resolverOpciones(producto, item.optionIds);
    if (!resultadoOpciones.ok) {
      if ("unavailableOptionId" in resultadoOpciones) {
        cambios.push({ productId: producto.id, change: "OPTION_UNAVAILABLE", optionId: resultadoOpciones.unavailableOptionId });
      } else {
        fields[`${campo}.${resultadoOpciones.field}`] = resultadoOpciones.message;
      }
      return;
    }

    const optionsTotalCents = sumarCentavos(resultadoOpciones.options.map((o) => o.priceDeltaCents));
    const unitCents = assertCentavos(producto.priceCents + optionsTotalCents);
    if (item.expectedUnitCents !== undefined && item.expectedUnitCents !== unitCents) {
      cambios.push({ productId: producto.id, change: "PRICE", oldCents: item.expectedUnitCents, newCents: unitCents });
    }

    lines.push({
      productId: producto.id,
      productName: producto.name,
      categoryName: producto.categoryName,
      unitPriceCents: producto.priceCents,
      optionsTotalCents,
      quantity,
      lineTotalCents: multiplicarCentavos(unitCents, quantity),
      note: item.note || null,
      position,
      options: resultadoOpciones.options,
    });
  });

  if (Object.keys(fields).length > 0) return { ok: false, code: "VALIDATION_ERROR", fields };
  if (cambios.length > 0) return { ok: false, code: "MENU_CHANGED", details: cambios };

  const subtotalCents = sumarCentavos(lines.map((l) => l.lineTotalCents));
  // El mínimo se compara contra los productos, sin el envío (RN-08).
  if (subtotalCents < negocio.minOrderCents) {
    return { ok: false, code: "MIN_ORDER_NOT_REACHED", missingCents: negocio.minOrderCents - subtotalCents };
  }
  const deliveryFeeCents = carrito.fulfillment === "DELIVERY" ? assertCentavos(negocio.deliveryFeeCents) : 0;

  return {
    ok: true,
    lines,
    subtotalCents,
    deliveryFeeCents,
    totalCents: sumarCentavos([subtotalCents, deliveryFeeCents]),
  };
}

type ResultadoOpciones =
  | { ok: true; options: OpcionCopiada[] }
  | { ok: false; field: string; message: string }
  | { ok: false; unavailableOptionId: string };

/** Valida las opciones elegidas contra los grupos del producto (RN-04). */
function resolverOpciones(producto: ProductoMenu, optionIds: readonly string[]): ResultadoOpciones {
  if (new Set(optionIds).size !== optionIds.length) {
    return { ok: false, field: "optionIds", message: "Hay opciones repetidas." };
  }

  const elegidas = new Set(optionIds);
  const options: OpcionCopiada[] = [];
  let encontradas = 0;

  for (const grupo of producto.groups) {
    const delGrupo = grupo.options.filter((o) => elegidas.has(o.id));
    encontradas += delGrupo.length;

    const noDisponible = delGrupo.find((o) => !o.isAvailable);
    if (noDisponible) return { ok: false, unavailableOptionId: noDisponible.id };

    if (delGrupo.length < grupo.minSelect) {
      return {
        ok: false,
        field: `groups.${grupo.id}`,
        message: grupo.minSelect === 1 ? `Elegí una opción en "${grupo.name}".` : `Elegí al menos ${grupo.minSelect} en "${grupo.name}".`,
      };
    }
    if (delGrupo.length > grupo.maxSelect) {
      return { ok: false, field: `groups.${grupo.id}`, message: `Podés elegir hasta ${grupo.maxSelect} en "${grupo.name}".` };
    }

    for (const opcion of delGrupo) {
      options.push({
        optionId: opcion.id,
        groupName: grupo.name,
        optionName: opcion.name,
        kind: grupo.kind,
        // Quitar un ingrediente nunca suma (los grupos REMOVE no tienen adicional).
        priceDeltaCents: grupo.kind === "REMOVE" ? 0 : assertCentavos(opcion.priceDeltaCents),
      });
    }
  }

  // Alguna opción no pertenece a ningún grupo del producto (otro producto u otro negocio).
  if (encontradas !== elegidas.size) {
    return { ok: false, field: "optionIds", message: "Alguna opción no corresponde a este producto." };
  }
  return { ok: true, options };
}
