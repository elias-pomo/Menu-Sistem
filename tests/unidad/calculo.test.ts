import { describe, expect, it } from "vitest";
import {
  calcularPedido,
  type CarritoPedido,
  type ConfiguracionNegocio,
  type ItemCarrito,
  type ProductoMenu,
} from "@/modulos/pedidos/calculo";

const NEGOCIO: ConfiguracionNegocio = {
  deliveryEnabled: true,
  deliveryFeeCents: 150_000,
  minOrderCents: 500_000,
  acceptCash: true,
  acceptTransfer: true,
};

const milanesa: ProductoMenu = {
  id: "milanesa",
  name: "Milanesa napolitana",
  categoryName: "Platos del día",
  priceCents: 920_000,
  isOrderable: true,
  isSoldOut: false,
  groups: [
    {
      id: "guarnicion",
      name: "Guarnición",
      kind: "CHOICE",
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: "papas", name: "Papas fritas", priceDeltaCents: 0, isAvailable: true },
        { id: "ensalada", name: "Ensalada", priceDeltaCents: 50_000, isAvailable: true },
        { id: "rusticas", name: "Papas rústicas", priceDeltaCents: 80_000, isAvailable: false },
      ],
    },
    {
      id: "extras",
      name: "Extras",
      kind: "CHOICE",
      minSelect: 0,
      maxSelect: 3,
      options: [
        { id: "huevo", name: "Huevo frito", priceDeltaCents: 60_000, isAvailable: true },
        { id: "queso", name: "Queso", priceDeltaCents: 70_000, isAvailable: true },
        { id: "jamon", name: "Jamón", priceDeltaCents: 70_000, isAvailable: true },
        { id: "panceta", name: "Panceta", priceDeltaCents: 90_000, isAvailable: true },
      ],
    },
    {
      id: "sin",
      name: "Sin ingredientes",
      kind: "REMOVE",
      minSelect: 0,
      maxSelect: 2,
      // Un adicional cargado por error en un grupo REMOVE no se cobra.
      options: [{ id: "sin-cebolla", name: "Sin cebolla", priceDeltaCents: 10_000, isAvailable: true }],
    },
  ],
};

const gaseosa: ProductoMenu = {
  id: "gaseosa",
  name: "Gaseosa 1,5 L",
  categoryName: "Bebidas",
  priceCents: 300_000,
  isOrderable: true,
  isSoldOut: false,
  groups: [],
};

const menu = (...productos: ProductoMenu[]) => new Map(productos.map((p) => [p.id, p]));
const MENU = menu(milanesa, gaseosa, { ...gaseosa, id: "agotado", isSoldOut: true }, { ...gaseosa, id: "archivado", isOrderable: false });

const item = (productId: string, extra: Partial<ItemCarrito> = {}): ItemCarrito => ({
  productId,
  quantity: 1,
  optionIds: productId === "milanesa" ? ["papas"] : [],
  note: null,
  ...extra,
});

const carrito = (items: ItemCarrito[], extra: Partial<CarritoPedido> = {}): CarritoPedido => ({
  fulfillment: "PICKUP",
  paymentMethod: "CASH",
  items,
  ...extra,
});

describe("calcularPedido", () => {
  it("calcula línea = cantidad × (base + adicionales) y total = líneas + envío (RN-02)", () => {
    const r = calcularPedido(
      carrito([item("milanesa", { quantity: 2, optionIds: ["ensalada", "huevo", "queso"] }), item("gaseosa")], {
        fulfillment: "DELIVERY",
      }),
      MENU,
      NEGOCIO,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 2 × (9.200 + 500 + 600 + 700) = 22.000; + 3.000 = 25.000; + 1.500 de envío.
    expect(r.lines[0]).toMatchObject({ unitPriceCents: 920_000, optionsTotalCents: 180_000, quantity: 2, lineTotalCents: 2_200_000 });
    expect(r.subtotalCents).toBe(2_500_000);
    expect(r.deliveryFeeCents).toBe(150_000);
    expect(r.totalCents).toBe(2_650_000);
  });

  it("guarda la copia histórica de nombres, categoría y opciones (RN-11)", () => {
    const r = calcularPedido(carrito([item("milanesa", { optionIds: ["papas", "sin-cebolla"], note: "bien cocida" })]), MENU, NEGOCIO);
    expect(r.ok && r.lines[0]).toEqual({
      productId: "milanesa",
      productName: "Milanesa napolitana",
      categoryName: "Platos del día",
      unitPriceCents: 920_000,
      optionsTotalCents: 0,
      quantity: 1,
      lineTotalCents: 920_000,
      note: "bien cocida",
      position: 0,
      options: [
        { optionId: "papas", groupName: "Guarnición", optionName: "Papas fritas", kind: "CHOICE", priceDeltaCents: 0 },
        { optionId: "sin-cebolla", groupName: "Sin ingredientes", optionName: "Sin cebolla", kind: "REMOVE", priceDeltaCents: 0 },
      ],
    });
  });

  it("en retiro no cobra envío", () => {
    const r = calcularPedido(carrito([item("milanesa")]), MENU, NEGOCIO);
    expect(r.ok && [r.deliveryFeeCents, r.totalCents]).toEqual([0, 920_000]);
  });

  it("ignora cualquier precio del navegador para calcular: solo lo usa para detectar cambios (RN-03, RN-06)", () => {
    const r = calcularPedido(carrito([item("gaseosa", { expectedUnitCents: 1 })]), MENU, { ...NEGOCIO, minOrderCents: 0 });
    expect(r).toEqual({ ok: false, code: "MENU_CHANGED", details: [{ productId: "gaseosa", change: "PRICE", oldCents: 1, newCents: 300_000 }] });

    const igual = calcularPedido(carrito([item("gaseosa", { expectedUnitCents: 300_000 })]), MENU, { ...NEGOCIO, minOrderCents: 0 });
    expect(igual.ok && igual.totalCents).toBe(300_000);
  });

  it("grupo obligatorio sin elegir: 400 con el campo (RN-04)", () => {
    const r = calcularPedido(carrito([item("milanesa", { optionIds: [] })]), MENU, NEGOCIO);
    expect(r).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: { "items.0.groups.guarnicion": 'Elegí una opción en "Guarnición".' } });
  });

  it("grupo con máximo 3 y se envían 4: 400", () => {
    const r = calcularPedido(carrito([item("milanesa", { optionIds: ["papas", "huevo", "queso", "jamon", "panceta"] })]), MENU, NEGOCIO);
    expect(r).toMatchObject({ ok: false, code: "VALIDATION_ERROR", fields: { "items.0.groups.extras": 'Podés elegir hasta 3 en "Extras".' } });
  });

  it("dos opciones en un grupo de máximo 1: 400", () => {
    const r = calcularPedido(carrito([item("milanesa", { optionIds: ["papas", "ensalada"] })]), MENU, NEGOCIO);
    expect(r).toMatchObject({ ok: false, code: "VALIDATION_ERROR", fields: { "items.0.groups.guarnicion": expect.any(String) } });
  });

  it("mínimo mayor a 1 usa el mensaje en plural", () => {
    const exigente = { ...milanesa, groups: [{ ...milanesa.groups[1], minSelect: 2 }] };
    const r = calcularPedido(carrito([item("milanesa", { optionIds: ["huevo"] })]), menu(exigente), NEGOCIO);
    expect(r).toMatchObject({ fields: { "items.0.groups.extras": 'Elegí al menos 2 en "Extras".' } });
  });

  it("opción de otro producto o de otro negocio: 400", () => {
    const r = calcularPedido(carrito([item("milanesa", { optionIds: ["papas", "opcion-ajena"] })]), MENU, NEGOCIO);
    expect(r).toMatchObject({ ok: false, code: "VALIDATION_ERROR", fields: { "items.0.optionIds": "Alguna opción no corresponde a este producto." } });
  });

  it("opciones repetidas: 400", () => {
    const r = calcularPedido(carrito([item("milanesa", { optionIds: ["papas", "papas"] })]), MENU, NEGOCIO);
    expect(r).toMatchObject({ code: "VALIDATION_ERROR", fields: { "items.0.optionIds": "Hay opciones repetidas." } });
  });

  it.each([0, 21, -1, 1.5, Number.NaN])("cantidad %s: 400", (quantity) => {
    const r = calcularPedido(carrito([item("gaseosa", { quantity })]), MENU, NEGOCIO);
    expect(r).toMatchObject({ ok: false, code: "VALIDATION_ERROR", fields: { "items.0.quantity": expect.any(String) } });
  });

  it("acepta cantidades 1 y 20", () => {
    for (const quantity of [1, 20]) {
      const r = calcularPedido(carrito([item("gaseosa", { quantity })]), MENU, { ...NEGOCIO, minOrderCents: 0 });
      expect(r.ok).toBe(true);
    }
  });

  it("nota de 200 caracteres se acepta y de 201 no (RN-07)", () => {
    const ok = calcularPedido(carrito([item("milanesa", { note: "a".repeat(200) })]), MENU, NEGOCIO);
    expect(ok.ok).toBe(true);
    const largo = calcularPedido(carrito([item("milanesa", { note: "a".repeat(201) })]), MENU, NEGOCIO);
    expect(largo).toMatchObject({ code: "VALIDATION_ERROR", fields: { "items.0.note": expect.any(String) } });
  });

  it("pedido vacío o con más de 30 productos distintos: 400", () => {
    expect(calcularPedido(carrito([]), MENU, NEGOCIO)).toMatchObject({ code: "VALIDATION_ERROR", fields: { items: expect.any(String) } });
    const muchos = Array.from({ length: 31 }, () => item("gaseosa"));
    expect(calcularPedido(carrito(muchos), MENU, NEGOCIO)).toMatchObject({ code: "VALIDATION_ERROR", fields: { items: expect.any(String) } });
  });

  it("producto agotado, archivado o inexistente: 409 con la lista de ítems afectados (RN-05)", () => {
    const r = calcularPedido(carrito([item("agotado"), item("archivado"), item("no-existe"), item("milanesa")]), MENU, NEGOCIO);
    expect(r).toEqual({
      ok: false,
      code: "MENU_CHANGED",
      details: [
        { productId: "agotado", change: "SOLD_OUT" },
        { productId: "archivado", change: "UNAVAILABLE" },
        { productId: "no-existe", change: "UNAVAILABLE" },
      ],
    });
  });

  it("opción no disponible: 409", () => {
    const r = calcularPedido(carrito([item("milanesa", { optionIds: ["rusticas"] })]), MENU, NEGOCIO);
    expect(r).toEqual({ ok: false, code: "MENU_CHANGED", details: [{ productId: "milanesa", change: "OPTION_UNAVAILABLE", optionId: "rusticas" }] });
  });

  it("los errores de validación se informan antes que los cambios de menú", () => {
    const r = calcularPedido(carrito([item("agotado"), item("gaseosa", { quantity: 0 })]), MENU, NEGOCIO);
    expect(r).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("subtotal por debajo del mínimo: 422 con el faltante, sin contar el envío (RN-08)", () => {
    const r = calcularPedido(carrito([item("gaseosa")], { fulfillment: "DELIVERY" }), MENU, NEGOCIO);
    expect(r).toEqual({ ok: false, code: "MIN_ORDER_NOT_REACHED", missingCents: 200_000 });
    const justo = calcularPedido(carrito([item("gaseosa")]), MENU, { ...NEGOCIO, minOrderCents: 300_000 });
    expect(justo.ok).toBe(true);
  });

  it("delivery desactivado: 422 (RN-09)", () => {
    const r = calcularPedido(carrito([item("milanesa")], { fulfillment: "DELIVERY" }), MENU, { ...NEGOCIO, deliveryEnabled: false });
    expect(r).toEqual({ ok: false, code: "DELIVERY_DISABLED" });
  });

  it("medio de pago no habilitado: 422", () => {
    expect(calcularPedido(carrito([item("milanesa")], { paymentMethod: "TRANSFER" }), MENU, { ...NEGOCIO, acceptTransfer: false })).toEqual({
      ok: false,
      code: "PAYMENT_METHOD_DISABLED",
    });
    expect(calcularPedido(carrito([item("milanesa")]), MENU, { ...NEGOCIO, acceptCash: false })).toEqual({
      ok: false,
      code: "PAYMENT_METHOD_DISABLED",
    });
  });

  it("nunca produce importes con decimales", () => {
    const r = calcularPedido(carrito([item("milanesa", { quantity: 7, optionIds: ["ensalada", "panceta"] })]), MENU, NEGOCIO);
    expect(r.ok).toBe(true);
    if (r.ok) for (const v of [r.subtotalCents, r.totalCents, r.lines[0].lineTotalCents]) expect(Number.isInteger(v)).toBe(true);
  });
});
