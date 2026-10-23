import { describe, expect, it } from "vitest";
import {
  aceptarPreciosActuales,
  agregarItem,
  CARRITO_VACIO,
  cambiarCantidad,
  claveItem,
  evaluarCarrito,
  leerCarrito,
  quitarItem,
  reemplazarItem,
} from "@/componentes/menu/carrito";
import { contraste, textoSobre } from "@/lib/color";
import type { MenuPublico } from "@/modulos/menu/tipos";

const MENU: MenuPublico = {
  business: {
    slug: "hawkens-food",
    name: "Hawken's Food",
    address: null,
    logoUrl: null,
    primaryColor: "#c2410c",
    whatsappE164: null,
    acceptingOrders: true,
    pauseMessage: null,
    deliveryEnabled: true,
    deliveryFeeCents: 150_000,
    minOrderCents: 1_000_000,
    acceptCash: true,
    acceptTransfer: false,
    showPhotos: true,
    showDescriptions: true,
    menuVersion: 3,
    timezone: "America/Argentina/Buenos_Aires",
    openingHours: [],
  },
  categories: [
    {
      id: "c1",
      name: "Nueva línea de hamburguesas",
      products: [
        {
          id: "cheesse",
          name: "Cheesse",
          description: null,
          priceCents: 850_000,
          imageUrl: null,
          tags: [],
          isSoldOut: false,
          groups: [
            {
              id: "tamano",
              name: "Tamaño",
              kind: "CHOICE",
              minSelect: 1,
              maxSelect: 1,
              options: [
                { id: "simple", name: "Simple", priceDeltaCents: 0, isAvailable: true },
                { id: "doble", name: "Doble", priceDeltaCents: 150_000, isAvailable: true },
                { id: "triple", name: "Triple", priceDeltaCents: 250_000, isAvailable: false },
              ],
            },
          ],
        },
        { id: "billy", name: "Hamburguesa Billy", description: null, priceCents: 1_200_000, imageUrl: null, tags: [], isSoldOut: false, groups: [] },
        { id: "agotada", name: "Royal", description: null, priceCents: 950_000, imageUrl: null, tags: [], isSoldOut: true, groups: [] },
      ],
    },
  ],
};

const item = (productId: string, optionIds: string[], unitCents: number, quantity = 1) => ({
  productId,
  quantity,
  optionIds,
  note: null,
  unitCents,
});

describe("carrito", () => {
  it("dos ítems iguales se suman en una línea; con otras opciones son líneas distintas", () => {
    let c = agregarItem(CARRITO_VACIO, item("cheesse", ["doble"], 1_000_000), 3);
    c = agregarItem(c, item("cheesse", ["doble"], 1_000_000, 2), 3);
    c = agregarItem(c, item("cheesse", ["simple"], 850_000), 3);
    expect(c.items.map((i) => [i.optionIds[0], i.quantity])).toEqual([
      ["doble", 3],
      ["simple", 1],
    ]);
    expect(c.menuVersion).toBe(3);
  });

  it("la clave no depende del orden de las opciones", () => {
    expect(claveItem("p", ["b", "a"], " nota ")).toBe(claveItem("p", ["a", "b"], "nota"));
  });

  it("la cantidad no pasa de 20 y llegar a 0 quita el ítem", () => {
    let c = agregarItem(CARRITO_VACIO, item("billy", [], 1_200_000, 19), 3);
    c = agregarItem(c, item("billy", [], 1_200_000, 5), 3);
    expect(c.items[0].quantity).toBe(20);
    expect(cambiarCantidad(c, c.items[0].key, 0).items).toHaveLength(0);
    expect(quitarItem(c, c.items[0].key).items).toHaveLength(0);
  });

  it("editar reemplaza el ítem por el nuevo", () => {
    const c = agregarItem(CARRITO_VACIO, item("cheesse", ["simple"], 850_000), 3);
    const editado = reemplazarItem(c, c.items[0].key, item("cheesse", ["doble"], 1_000_000, 2), 3);
    expect(editado.items).toHaveLength(1);
    expect(editado.items[0]).toMatchObject({ optionIds: ["doble"], quantity: 2 });
  });

  it("evalúa con el mismo cálculo del servidor: subtotal, unidades y faltante del mínimo", () => {
    let c = agregarItem(CARRITO_VACIO, item("cheesse", ["doble"], 1_000_000, 2), 3);
    c = agregarItem(c, item("billy", [], 1_200_000), 3);
    const r = evaluarCarrito(MENU, c);
    expect(r.subtotalCents).toBe(3_200_000);
    expect(r.unidades).toBe(3);
    expect(r.faltanteMinimoCents).toBe(0);
    expect(r.hayProblemas).toBe(false);
    expect(r.lineas[0]).toMatchObject({ estado: "ok", detalle: "Doble", lineCents: 2_000_000 });

    const chico = evaluarCarrito(MENU, agregarItem(CARRITO_VACIO, item("cheesse", ["simple"], 850_000), 3));
    expect(chico.faltanteMinimoCents).toBe(150_000);
  });

  it("marca agotados, productos que ya no están y opciones no disponibles, y no los suma", () => {
    let c = agregarItem(CARRITO_VACIO, item("agotada", [], 950_000), 3);
    c = agregarItem(c, item("ya-no-existe", [], 100), 3);
    c = agregarItem(c, item("cheesse", ["triple"], 1_100_000), 3);
    const r = evaluarCarrito(MENU, c);
    expect(r.lineas.map((l) => (l.estado === "no_disponible" ? l.motivo : "ok"))).toEqual([
      "Se agotó.",
      "Ya no está en el menú.",
      "Una de las opciones elegidas ya no está disponible.",
    ]);
    expect(r.subtotalCents).toBe(0);
    expect(r.hayProblemas).toBe(true);
  });

  it("detecta un cambio de precio y al aceptarlo guarda el precio nuevo y descarta lo no disponible", () => {
    let c = agregarItem(CARRITO_VACIO, item("billy", [], 1_000_000), 2);
    c = agregarItem(c, item("agotada", [], 950_000), 2);
    const r = evaluarCarrito(MENU, c);
    expect(r.lineas[0]).toMatchObject({ estado: "ok", precioCambio: true, unitCents: 1_200_000 });
    const aceptado = aceptarPreciosActuales(c, r.lineas, 3);
    expect(aceptado.items).toEqual([expect.objectContaining({ productId: "billy", unitCents: 1_200_000 })]);
    expect(aceptado.menuVersion).toBe(3);
    expect(evaluarCarrito(MENU, aceptado).hayProblemas).toBe(false);
  });

  it("leer lo guardado tolera datos rotos o manipulados", () => {
    expect(leerCarrito(null)).toBe(CARRITO_VACIO);
    expect(leerCarrito("{no es json")).toBe(CARRITO_VACIO);
    expect(leerCarrito(JSON.stringify({ items: "x", menuVersion: 1 }))).toBe(CARRITO_VACIO);
    const raro = leerCarrito(
      JSON.stringify({ menuVersion: 1, items: [{ productId: "billy", quantity: 1, optionIds: [], unitCents: 1 }, { productId: 5 }, null] }),
    );
    expect(raro.items).toHaveLength(1);
    expect(raro.items[0]).toMatchObject({ note: null, key: claveItem("billy", [], null) });
  });
});

describe("contraste del color del negocio", () => {
  it("elige blanco sobre colores oscuros y oscuro sobre colores claros", () => {
    expect(textoSobre("#c2410c")).toBe("#ffffff");
    expect(textoSobre("#1d4ed8")).toBe("#ffffff");
    expect(textoSobre("#facc15")).toBe("#1c1917");
    // Dorado claro: el caso de tus notas, que con texto blanco daba 2,1:1.
    expect(textoSobre("#e5c07b")).toBe("#1c1917");
    expect(textoSobre("rojo")).toBe("#ffffff");
  });

  it("el texto elegido siempre logra al menos 4,5:1 en colores típicos", () => {
    for (const color of ["#c2410c", "#15803d", "#7c3aed", "#facc15", "#e5c07b", "#0ea5e9", "#be123c"]) {
      expect(contraste(color, textoSobre(color)), color).toBeGreaterThanOrEqual(4.5);
    }
  });
});
