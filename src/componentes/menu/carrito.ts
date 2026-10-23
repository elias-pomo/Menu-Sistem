import { calcularPedido, LIMITES_PEDIDO, type CambioMenu } from "@/modulos/pedidos/calculo";
import { productosParaCalculo, type MenuPublico, type ProductoPublico } from "@/modulos/menu/tipos";

/**
 * Carrito del cliente (RF-006, RF-007). Vive en el dispositivo y guarda la versión del menú con que
 * se armó. Los importes de acá son solo para mostrar: el servidor recalcula todo al confirmar.
 */

export type ItemCarrito = {
  /** Producto + opciones + nota: dos ítems iguales se suman en una sola línea. */
  key: string;
  productId: string;
  quantity: number;
  optionIds: string[];
  note: string | null;
  /** Precio por unidad (base + opciones) que vio el cliente al agregarlo. */
  unitCents: number;
};

export type Carrito = { menuVersion: number; items: ItemCarrito[] };

export const CARRITO_VACIO: Carrito = { menuVersion: 0, items: [] };

export function claveItem(productId: string, optionIds: readonly string[], note: string | null): string {
  return [productId, [...optionIds].sort().join(","), note?.trim() ?? ""].join("|");
}

/** Agrega un ítem; si ya hay uno igual, suma la cantidad (con el tope de 20). */
export function agregarItem(carrito: Carrito, item: Omit<ItemCarrito, "key">, menuVersion: number): Carrito {
  const key = claveItem(item.productId, item.optionIds, item.note);
  const existente = carrito.items.find((i) => i.key === key);
  const items = existente
    ? carrito.items.map((i) =>
        i.key === key ? { ...i, quantity: Math.min(LIMITES_PEDIDO.maxQuantity, i.quantity + item.quantity), unitCents: item.unitCents } : i,
      )
    : [...carrito.items, { ...item, key }];
  return { menuVersion, items: items.slice(0, LIMITES_PEDIDO.maxItems) };
}

export function cambiarCantidad(carrito: Carrito, key: string, quantity: number): Carrito {
  if (quantity < LIMITES_PEDIDO.minQuantity) return quitarItem(carrito, key);
  const cantidad = Math.min(LIMITES_PEDIDO.maxQuantity, Math.floor(quantity));
  return { ...carrito, items: carrito.items.map((i) => (i.key === key ? { ...i, quantity: cantidad } : i)) };
}

export function quitarItem(carrito: Carrito, key: string): Carrito {
  return { ...carrito, items: carrito.items.filter((i) => i.key !== key) };
}

export function reemplazarItem(carrito: Carrito, key: string, nuevo: Omit<ItemCarrito, "key">, menuVersion: number): Carrito {
  return agregarItem(quitarItem(carrito, key), nuevo, menuVersion);
}

export type LineaCarrito =
  | {
      estado: "ok";
      item: ItemCarrito;
      producto: ProductoPublico;
      unitCents: number;
      lineCents: number;
      /** "Doble · Sin cebolla" */
      detalle: string;
      precioCambio: boolean;
    }
  | { estado: "no_disponible"; item: ItemCarrito; producto: ProductoPublico | null; motivo: string };

const MOTIVO: Record<CambioMenu["change"], string> = {
  UNAVAILABLE: "Ya no está en el menú.",
  SOLD_OUT: "Se agotó.",
  OPTION_UNAVAILABLE: "Una de las opciones elegidas ya no está disponible.",
  PRICE: "Cambió el precio.",
};

/** Revisa cada ítem contra el menú actual con el mismo cálculo que usa el servidor. */
export function evaluarCarrito(menu: MenuPublico, carrito: Carrito) {
  const productos = productosParaCalculo(menu);
  const publicos = new Map(menu.categories.flatMap((c) => c.products.map((p) => [p.id, p] as const)));
  // Para evaluar línea por línea no importan la entrega, el pago ni el mínimo.
  const permisivo = { deliveryEnabled: true, deliveryFeeCents: 0, minOrderCents: 0, acceptCash: true, acceptTransfer: true };

  const lineas: LineaCarrito[] = carrito.items.map((item) => {
    const producto = publicos.get(item.productId) ?? null;
    const r = calcularPedido(
      { fulfillment: "PICKUP", paymentMethod: "CASH", items: [{ ...item, expectedUnitCents: undefined }] },
      productos,
      permisivo,
    );
    if (!r.ok) {
      const motivo = r.code === "MENU_CHANGED" ? MOTIVO[r.details[0].change] : "Revisá las opciones de este producto.";
      return { estado: "no_disponible", item, producto, motivo };
    }
    const [linea] = r.lines;
    const unitCents = linea.unitPriceCents + linea.optionsTotalCents;
    return {
      estado: "ok",
      item,
      producto: producto!,
      unitCents,
      lineCents: linea.lineTotalCents,
      detalle: linea.options.map((o) => o.optionName).join(" · "),
      precioCambio: unitCents !== item.unitCents,
    };
  });

  const subtotalCents = lineas.reduce((s, l) => s + (l.estado === "ok" ? l.lineCents : 0), 0);
  const unidades = lineas.reduce((s, l) => s + (l.estado === "ok" ? l.item.quantity : 0), 0);
  const faltanteMinimoCents = Math.max(0, menu.business.minOrderCents - subtotalCents);
  return {
    lineas,
    subtotalCents,
    unidades,
    faltanteMinimoCents,
    hayProblemas: lineas.some((l) => l.estado !== "ok" || l.precioCambio),
  };
}

/** Acepta los precios actuales de las líneas que cambiaron. */
export function aceptarPreciosActuales(carrito: Carrito, lineas: LineaCarrito[], menuVersion: number): Carrito {
  const precios = new Map(lineas.flatMap((l) => (l.estado === "ok" ? [[l.item.key, l.unitCents] as const] : [])));
  return {
    menuVersion,
    items: carrito.items.filter((i) => precios.has(i.key)).map((i) => ({ ...i, unitCents: precios.get(i.key)! })),
  };
}

/** Lee un carrito guardado; ante cualquier dato raro, carrito vacío. */
export function leerCarrito(texto: string | null): Carrito {
  if (!texto) return CARRITO_VACIO;
  try {
    const datos = JSON.parse(texto) as Partial<Carrito>;
    if (!Array.isArray(datos.items) || typeof datos.menuVersion !== "number") return CARRITO_VACIO;
    const items = datos.items.filter(
      (i): i is ItemCarrito =>
        !!i &&
        typeof i.productId === "string" &&
        Number.isInteger(i.quantity) &&
        Array.isArray(i.optionIds) &&
        i.optionIds.every((o) => typeof o === "string") &&
        typeof i.unitCents === "number",
    );
    return {
      menuVersion: datos.menuVersion,
      items: items.map((i) => ({ ...i, note: typeof i.note === "string" ? i.note : null, key: claveItem(i.productId, i.optionIds, i.note) })),
    };
  } catch {
    return CARRITO_VACIO;
  }
}
