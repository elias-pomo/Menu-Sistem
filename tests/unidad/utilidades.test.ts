import { describe, expect, it } from "vitest";
import { formatearPesos, multiplicarCentavos, pesosACentavos, sumarCentavos } from "@/lib/dinero";
import { enmascararTelefono, normalizarCelularAR, numeroWhatsApp } from "@/lib/telefono";
import { FORMATO_TOKEN_PUBLICO, generarCodigoCorto, generarTokenPublico, generarTokenSesion, sha256Hex } from "@/lib/tokens";
import { limpiarParaAuditoria } from "@/modulos/auditoria";
import { hashearContrasena, problemaConContrasena, verificarContrasena } from "@/modulos/autenticacion/contrasenas";
import { PERMISOS, puede, ROLES, tieneRolMinimo } from "@/modulos/autenticacion/permisos";

describe("dinero", () => {
  it("suma y multiplica en enteros", () => {
    expect(sumarCentavos([920_000, 50_000, 150_000])).toBe(1_120_000);
    expect(multiplicarCentavos(985_000, 20)).toBe(19_700_000);
  });

  it("rechaza decimales, negativos y valores fuera de rango", () => {
    expect(() => sumarCentavos([10.5])).toThrow(RangeError);
    expect(() => sumarCentavos([-1])).toThrow(RangeError);
    expect(() => multiplicarCentavos(100, 1.5)).toThrow(RangeError);
    expect(() => multiplicarCentavos(10_000_000_000, 2)).toThrow(RangeError);
  });

  it("formatea en pesos argentinos", () => {
    expect(formatearPesos(1_840_000).replace(/\s/g, " ")).toBe("$ 18.400");
    expect(formatearPesos(1_840_050).replace(/\s/g, " ")).toBe("$ 18.400,50");
  });

  it.each([
    ["1.500", 150_000],
    ["1500", 150_000],
    ["1500,5", 150_050],
    ["$ 1.500,50", 150_050],
    ["0", 0],
  ])("lee %s como %i centavos", (texto, esperado) => {
    expect(pesosACentavos(texto)).toBe(esperado);
  });

  it.each(["", "abc", "1,555", "-10", "1.50", "1.500.00"])("rechaza %s", (texto) => {
    expect(pesosACentavos(texto)).toBeNull();
  });
});

describe("teléfono", () => {
  it.each([
    ["0381 15-555-1234", "+5493815551234"],
    ["+54 9 381 555 1234", "+5493815551234"],
    ["381 555-1234", "+5493815551234"],
    ["3815551234", "+5493815551234"],
    ["011 15 2345 6789", "+5491123456789"],
  ])("normaliza %s a %s", (entrada, esperado) => {
    expect(normalizarCelularAR(entrada)).toBe(esperado);
  });

  it.each(["12345", "abc381", "", "   ", "+1 202 555 0123"])("rechaza %s", (entrada) => {
    expect(normalizarCelularAR(entrada)).toBeNull();
  });

  it("arma el número de wa.me sin signos (549 + área + número)", () => {
    expect(numeroWhatsApp("+5493815551234")).toBe("5493815551234");
  });

  it("enmascara para logs", () => {
    expect(enmascararTelefono("+5493815551234")).toBe("***1234");
    expect(enmascararTelefono(null)).toBe("");
  });
});

describe("tokens", () => {
  it("token público de 22 caracteres (128 bits) y distinto cada vez", () => {
    const a = generarTokenPublico();
    expect(a).toMatch(FORMATO_TOKEN_PUBLICO);
    expect(a).not.toBe(generarTokenPublico());
  });

  it("token de sesión de 256 bits y hash SHA-256 en hex", () => {
    expect(Buffer.from(generarTokenSesion(), "base64url")).toHaveLength(32);
    expect(sha256Hex("x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("código corto de 4 caracteres sin letras ambiguas", () => {
    for (let i = 0; i < 200; i++) expect(generarCodigoCorto()).toMatch(/^[2-9A-HJKMNP-Z]{4}$/);
  });
});

describe("contraseñas", () => {
  it("usa Argon2id y verifica", async () => {
    const hash = await hashearContrasena("una clave larga");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verificarContrasena(hash, "una clave larga")).toBe(true);
    expect(await verificarContrasena(hash, "otra clave larga")).toBe(false);
    expect(await verificarContrasena("hash-roto", "x")).toBe(false);
  });

  it("exige 10 caracteres y rechaza las comunes", () => {
    expect(problemaConContrasena("corta")).toContain("10 caracteres");
    expect(problemaConContrasena("1234567890")).toContain("común");
    expect(problemaConContrasena("Password123")).toContain("común");
    expect(problemaConContrasena("milanesa con papas")).toBeNull();
  });
});

describe("permisos", () => {
  it("la jerarquía es STAFF < MANAGER < OWNER", () => {
    expect(tieneRolMinimo("OWNER", "STAFF")).toBe(true);
    expect(tieneRolMinimo("MANAGER", "OWNER")).toBe(false);
    expect(tieneRolMinimo("STAFF", "MANAGER")).toBe(false);
  });

  it("coincide con la tabla de la sección 5 del plan", () => {
    const esperado: Record<string, (typeof ROLES)[number][]> = {
      "pedidos.ver": ["STAFF", "MANAGER", "OWNER"],
      "pedidos.cancelar": ["STAFF", "MANAGER", "OWNER"],
      "pedidos.marcarCobrado": ["STAFF", "MANAGER", "OWNER"],
      "productos.disponibilidad": ["STAFF", "MANAGER", "OWNER"],
      "negocio.pausar": ["STAFF", "MANAGER", "OWNER"],
      "menu.precios": ["MANAGER", "OWNER"],
      "metricas.ver": ["MANAGER", "OWNER"],
      "negocio.envioYPagos": ["OWNER"],
      "auditoria.ver": ["OWNER"],
      "usuarios.gestionar": ["OWNER"],
    };
    for (const [permiso, roles] of Object.entries(esperado)) {
      for (const rol of ROLES) expect(puede(rol, permiso as keyof typeof PERMISOS), `${rol} ${permiso}`).toBe(roles.includes(rol));
    }
  });
});

describe("auditoría", () => {
  it("nunca guarda contraseñas ni tokens", () => {
    expect(
      limpiarParaAuditoria({ name: "Ana", passwordHash: "x", token: "y", nested: { sessionSecret: "z", priceCents: 10 } }),
    ).toEqual({ name: "Ana", nested: { priceCents: 10 } });
    expect(limpiarParaAuditoria(undefined)).toBeUndefined();
  });
});
