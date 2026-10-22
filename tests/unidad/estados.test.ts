import { describe, expect, it } from "vitest";
import { ROLES } from "@/modulos/autenticacion/permisos";
import {
  ESTADOS,
  ESTADOS_ACTIVOS,
  evaluarTransicion,
  siguienteEstado,
  textoParaCliente,
  type EstadoPedido,
} from "@/modulos/pedidos/estados";
import type { TipoEntrega } from "@/modulos/pedidos/calculo";

// Las únicas transiciones válidas, escritas a mano a partir del diagrama de la sección 16.
const AVANCES_ESPERADOS: Record<TipoEntrega, [EstadoPedido, EstadoPedido][]> = {
  PICKUP: [
    ["PENDING", "CONFIRMED"],
    ["CONFIRMED", "PREPARING"],
    ["PREPARING", "READY"],
    ["READY", "DELIVERED"],
  ],
  DELIVERY: [
    ["PENDING", "CONFIRMED"],
    ["CONFIRMED", "PREPARING"],
    ["PREPARING", "READY"],
    ["READY", "ON_THE_WAY"],
    ["ON_THE_WAY", "DELIVERED"],
  ],
};
const RETROCESOS_ESPERADOS: [EstadoPedido, EstadoPedido][] = [
  ["CONFIRMED", "PENDING"],
  ["PREPARING", "CONFIRMED"],
  ["READY", "PREPARING"],
  ["ON_THE_WAY", "READY"],
];

const esAvance = (f: TipoEntrega, from: EstadoPedido, to: EstadoPedido) =>
  AVANCES_ESPERADOS[f].some(([a, b]) => a === from && b === to);
const esRetroceso = (from: EstadoPedido, to: EstadoPedido) =>
  RETROCESOS_ESPERADOS.some(([a, b]) => a === from && b === to);

describe("evaluarTransicion: tabla completa estado × estado × entrega × rol", () => {
  for (const fulfillment of ["PICKUP", "DELIVERY"] as const) {
    for (const from of ESTADOS) {
      for (const to of ESTADOS) {
        for (const role of ROLES) {
          it(`${fulfillment} ${from} → ${to} como ${role}`, () => {
            const conMotivo = evaluarTransicion({ from, to, fulfillment, role, reason: "motivo" });
            const sinMotivo = evaluarTransicion({ from, to, fulfillment, role, reason: "  " });

            if (from === "DELIVERED" || from === "CANCELLED" || (from === "ON_THE_WAY" && fulfillment === "PICKUP")) {
              expect(conMotivo).toEqual({ ok: false, code: "INVALID_TRANSITION" });
            } else if (to === "CANCELLED") {
              expect(conMotivo).toEqual({ ok: true, tipo: "CANCELACION" });
              expect(sinMotivo).toEqual({ ok: false, code: "REASON_REQUIRED" });
            } else if (esAvance(fulfillment, from, to)) {
              expect(sinMotivo).toEqual({ ok: true, tipo: "AVANCE" });
            } else if (esRetroceso(from, to)) {
              if (role === "STAFF") {
                expect(conMotivo).toEqual({ ok: false, code: "FORBIDDEN" });
              } else {
                expect(conMotivo).toEqual({ ok: true, tipo: "RETROCESO" });
                expect(sinMotivo).toEqual({ ok: false, code: "REASON_REQUIRED" });
              }
            } else {
              expect(conMotivo).toEqual({ ok: false, code: "INVALID_TRANSITION" });
            }
          });
        }
      }
    }
  }
});

describe("siguienteEstado", () => {
  it("sigue el camino de retiro y de delivery", () => {
    expect(siguienteEstado("READY", "PICKUP")).toBe("DELIVERED");
    expect(siguienteEstado("READY", "DELIVERY")).toBe("ON_THE_WAY");
    expect(siguienteEstado("PENDING", "PICKUP")).toBe("CONFIRMED");
    expect(siguienteEstado("DELIVERED", "PICKUP")).toBeNull();
    expect(siguienteEstado("CANCELLED", "DELIVERY")).toBeNull();
  });

  it("todo estado activo tiene un siguiente paso", () => {
    for (const estado of ESTADOS_ACTIVOS) expect(siguienteEstado(estado, "DELIVERY")).not.toBeNull();
  });
});

describe("textoParaCliente", () => {
  it("no dice 'aceptado' mientras está pendiente", () => {
    expect(textoParaCliente("PENDING", "PICKUP")).toBe("Pedido enviado. Falta que el local lo confirme.");
  });

  it("muestra los minutos estimados al confirmar", () => {
    expect(textoParaCliente("CONFIRMED", "PICKUP", 30)).toContain("30 min");
    expect(textoParaCliente("CONFIRMED", "PICKUP")).toBe("El local confirmó tu pedido.");
  });

  it("distingue retiro de delivery cuando está listo", () => {
    expect(textoParaCliente("READY", "PICKUP")).toContain("retirarlo");
    expect(textoParaCliente("READY", "DELIVERY")).toContain("repartidor");
  });

  it("tiene texto para todos los estados", () => {
    for (const estado of ESTADOS) expect(textoParaCliente(estado, "DELIVERY").length).toBeGreaterThan(5);
  });
});
