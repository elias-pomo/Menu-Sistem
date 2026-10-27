import { describe, expect, it } from "vitest";
import { diasDelPeriodo, periodoDeAtajo, problemaConPeriodo } from "@/modulos/metricas/periodo";
import { enlaceWhatsApp, ESTADOS_CON_MENSAJE, mensajeParaCliente, type PedidoParaMensaje } from "@/modulos/whatsapp";

const negocio = { name: "La Esquina", address: "Mendoza 1200", transferAlias: "la.esquina.mp", transferHolder: "La Esquina SRL" };
const SEGUIMIENTO = "https://ejemplo.test/la-esquina/pedido/abc";
const base: PedidoParaMensaje = { code: "K7P2", status: "CONFIRMED", fulfillment: "PICKUP", customerName: "Ana María Pérez", estimatedMinutes: 30, totalCents: 1_250_000, paymentMethod: "CASH", cancelReason: null };
const mensaje = (cambios: Partial<PedidoParaMensaje>) => mensajeParaCliente({ ...base, ...cambios }, negocio, SEGUIMIENTO);

describe("mensajes de WhatsApp por estado", () => {
  it("hay mensaje para los 6 estados con aviso y ninguno para pendiente", () => {
    for (const status of ESTADOS_CON_MENSAJE) expect(mensaje({ status })).not.toBeNull();
    expect(mensaje({ status: "PENDING" })).toBeNull();
  });

  it("confirmado: saluda por el primer nombre, da los minutos y el seguimiento", () => {
    expect(mensaje({})).toBe(`¡Hola Ana! Confirmamos tu pedido K7P2 en La Esquina. Va a estar listo en unos 30 minutos.\nSeguilo acá: ${SEGUIMIENTO}`);
  });

  it("confirmado con transferencia: agrega total, alias y titular", () => {
    expect(mensaje({ paymentMethod: "TRANSFER" })).toMatch(/Podés transferir \$\s?12\.500 al alias la\.esquina\.mp \(La Esquina SRL\)\./);
  });

  it("listo: retiro con dirección e importe en efectivo; delivery dice que sale", () => {
    expect(mensaje({ status: "READY" })).toMatch(/^¡Hola Ana! Tu pedido K7P2 está listo para retirar en Mendoza 1200\. Son \$\s?12\.500\.$/);
    expect(mensaje({ status: "READY", fulfillment: "DELIVERY" })).toContain("está listo y sale en un rato");
  });

  it("en camino, entregado y en preparación", () => {
    expect(mensaje({ status: "ON_THE_WAY", fulfillment: "DELIVERY" })).toMatch(/va en camino\. Son \$\s?12\.500 en efectivo\./);
    expect(mensaje({ status: "PREPARING" })).toContain("Ya estamos preparando tu pedido K7P2.");
    expect(mensaje({ status: "DELIVERED" })).toBe("¡Gracias por tu pedido, Ana! Esperamos que lo disfrutes. La Esquina");
  });

  it("cancelado: explica el motivo, sin repetir el texto interno", () => {
    expect(mensaje({ status: "CANCELLED", cancelReason: "OUT_OF_STOCK" })).toBe("Hola Ana, tuvimos que cancelar tu pedido K7P2 porque nos quedamos sin stock. Disculpá las molestias.");
    expect(mensaje({ status: "CANCELLED", cancelReason: "OTHER" })).toBe("Hola Ana, tuvimos que cancelar tu pedido K7P2. Disculpá las molestias.");
    expect(mensaje({ status: "CANCELLED", cancelReason: "CUSTOMER_REQUEST" })).toBe("Hola Ana, cancelamos tu pedido K7P2 como nos pediste.");
  });

  it("sin nombre (datos anonimizados) no deja espacios raros", () => {
    expect(mensaje({ customerName: null })).toMatch(/^¡Hola! Confirmamos/);
    expect(mensaje({ customerName: null, status: "DELIVERED" })).toMatch(/^¡Gracias por tu pedido! /);
  });

  it("el enlace usa solo dígitos y codifica el texto", () => {
    const enlace = enlaceWhatsApp("+5493815551234", "¡Hola! Pedido K7P2 & más\nlínea 2");
    expect(enlace).toBe("https://wa.me/5493815551234?text=%C2%A1Hola!%20Pedido%20K7P2%20%26%20m%C3%A1s%0Al%C3%ADnea%202");
    expect(new URL(enlace).searchParams.get("text")).toBe("¡Hola! Pedido K7P2 & más\nlínea 2");
  });
});

describe("período de las métricas", () => {
  it("valida formato, fechas reales, orden y máximo", () => {
    expect(problemaConPeriodo("2026-10-01", "2026-10-27")).toBeNull();
    expect(problemaConPeriodo("2026-10-01", null)).not.toBeNull();
    expect(problemaConPeriodo("01/10/2026", "2026-10-27")).not.toBeNull();
    expect(problemaConPeriodo("2026-02-29", "2026-03-01")).toMatch(/no existe/);
    expect(problemaConPeriodo("2026-10-27", "2026-10-01")).toMatch(/posterior/);
    expect(problemaConPeriodo("2025-01-01", "2026-01-02")).toMatch(/366/);
    expect(diasDelPeriodo({ desde: "2026-10-27", hasta: "2026-10-27" })).toBe(1);
  });

  it("atajos a partir de hoy, incluido el cambio de año", () => {
    expect(periodoDeAtajo("hoy", "2026-10-27")).toEqual({ desde: "2026-10-27", hasta: "2026-10-27" });
    expect(periodoDeAtajo("ayer", "2026-11-01")).toEqual({ desde: "2026-10-31", hasta: "2026-10-31" });
    expect(periodoDeAtajo("7dias", "2026-10-27")).toEqual({ desde: "2026-10-21", hasta: "2026-10-27" });
    expect(periodoDeAtajo("mes", "2026-10-27")).toEqual({ desde: "2026-10-01", hasta: "2026-10-27" });
    expect(periodoDeAtajo("mesPasado", "2026-10-27")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(periodoDeAtajo("mesPasado", "2027-01-15")).toEqual({ desde: "2026-12-01", hasta: "2026-12-31" });
    expect(periodoDeAtajo("mesPasado", "2028-03-05")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });
});
