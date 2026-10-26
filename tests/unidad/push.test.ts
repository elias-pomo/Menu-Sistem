import { describe, expect, it } from "vitest";
import { Baja, mensajePedidoNuevo, Suscripcion } from "@/modulos/notificaciones";

describe("mensaje del aviso push", () => {
  it("lleva código, entrega, total y nombre; nunca teléfono ni dirección", () => {
    const m = mensajePedidoNuevo({ code: "K7P2", fulfillment: "DELIVERY", customerName: " Ana ", totalCents: 1_250_000 });
    expect(m.title).toBe("Pedido nuevo K7P2");
    expect(m.body).toMatch(/^Delivery · \$\s?12\.500 · Ana$/);
    expect(m).toMatchObject({ tag: "pedido-K7P2", url: "/admin" });
  });

  it("acorta los nombres largos y marca el retiro", () => {
    const m = mensajePedidoNuevo({ code: "AB23", fulfillment: "PICKUP", customerName: "N".repeat(60), totalCents: 500_050 });
    expect(m.body.startsWith("Retiro · ")).toBe(true);
    expect(m.body.endsWith(`${"N".repeat(29)}…`)).toBe(true);
    expect(m.body).toContain("5.000,50");
  });
});

describe("esquema de la suscripción", () => {
  const valida = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BNc", auth: "xyz" } };

  it("acepta la suscripción que serializa el navegador", () => {
    expect(Suscripcion.safeParse({ ...valida, expirationTime: null }).success).toBe(true);
  });

  it("rechaza endpoints que no son https y claves vacías", () => {
    expect(Suscripcion.safeParse({ ...valida, endpoint: "http://fcm.googleapis.com/x" }).success).toBe(false);
    expect(Suscripcion.safeParse({ ...valida, endpoint: "javascript:alert(1)" }).success).toBe(false);
    expect(Suscripcion.safeParse({ ...valida, keys: { p256dh: "", auth: "x" } }).success).toBe(false);
    expect(Baja.safeParse({ endpoint: "ftp://x" }).success).toBe(false);
  });
});
