import { describe, expect, it } from "vitest";
import { estadoApertura, estaEnHorario, fechaDeNegocio, horaAMinutos, minutosAHora, type Franja } from "@/modulos/negocio/horarios";

const ZONA = "America/Argentina/Buenos_Aires"; // UTC-3, sin horario de verano

// Lunes a sábado 11:00–15:00 y 19:30–23:30; el sábado a la noche cierra a la 01:00 del domingo.
const FRANJAS: Franja[] = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
  { weekday, opensMin: 11 * 60, closesMin: 15 * 60 },
  { weekday, opensMin: 19 * 60 + 30, closesMin: weekday === 6 ? 60 : 23 * 60 + 30 },
]);

/** Hora local de Buenos Aires a Date (UTC = local + 3 h). */
const local = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`);

describe("estaEnHorario", () => {
  it.each([
    ["2026-10-19", "11:00", true], // lunes, abre
    ["2026-10-19", "14:59", true],
    ["2026-10-19", "15:00", false], // cierra a las 15: ya no
    ["2026-10-19", "17:00", false], // entre turnos (turno cortado)
    ["2026-10-19", "21:00", true],
    ["2026-10-19", "23:30", false],
    ["2026-10-24", "23:59", true], // sábado a la noche
    ["2026-10-25", "00:30", true], // domingo de madrugada: sigue la franja del sábado
    ["2026-10-25", "01:00", false],
    ["2026-10-25", "12:00", false], // domingo cerrado
    ["2026-10-20", "00:30", false], // la franja del lunes no cruza la medianoche
  ])("%s %s → %s", (fecha, hora, esperado) => {
    expect(estaEnHorario(FRANJAS, local(fecha, hora), ZONA)).toBe(esperado);
  });

  it("usa la zona horaria del negocio, no la del servidor", () => {
    // 14:30 UTC = 11:30 en Buenos Aires: abierto.
    expect(estaEnHorario(FRANJAS, new Date("2026-10-19T14:30:00Z"), ZONA)).toBe(true);
    // 12:00 UTC = 09:00 en Buenos Aires: cerrado.
    expect(estaEnHorario(FRANJAS, new Date("2026-10-19T12:00:00Z"), ZONA)).toBe(false);
  });
});

describe("estadoApertura (RN-10)", () => {
  const abierto = local("2026-10-19", "12:00");

  it("pausado gana aunque esté en horario", () => {
    expect(estadoApertura({ acceptingOrders: false, timezone: ZONA }, FRANJAS, abierto)).toEqual({ abierto: false, motivo: "PAUSADO" });
  });

  it("en horario y sin pausa acepta pedidos", () => {
    expect(estadoApertura({ acceptingOrders: true, timezone: ZONA }, FRANJAS, abierto)).toEqual({ abierto: true });
  });

  it("fuera de horario", () => {
    expect(estadoApertura({ acceptingOrders: true, timezone: ZONA }, FRANJAS, local("2026-10-19", "17:00"))).toEqual({
      abierto: false,
      motivo: "FUERA_DE_HORARIO",
    });
  });
});

describe("conversiones", () => {
  it("hora ↔ minutos", () => {
    expect(horaAMinutos("19:30")).toBe(1170);
    expect(horaAMinutos("24:00")).toBeNull();
    expect(horaAMinutos("9:30")).toBeNull();
    expect(minutosAHora(1170)).toBe("19:30");
    expect(minutosAHora(0)).toBe("00:00");
  });

  it("la fecha de negocio es la local: 01:00 UTC del 20 sigue siendo el 19 en Buenos Aires", () => {
    expect(fechaDeNegocio(new Date("2026-10-20T01:00:00Z"), ZONA)).toBe("2026-10-19");
  });
});
