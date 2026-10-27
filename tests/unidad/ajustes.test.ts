import { describe, expect, it } from "vitest";
import { generarContrasenaTemporal } from "@/lib/tokens";
import { CambiosAjustes, EnvioYPagos, Horarios, Pausa } from "@/modulos/ajustes/esquemas";
import { describirRegistro } from "@/modulos/auditoria/historial";
import { problemaConContrasena } from "@/modulos/autenticacion/contrasenas";
import { UsuarioCambios, UsuarioNuevo } from "@/modulos/usuarios/esquemas";

const envio = { deliveryEnabled: true, deliveryFeeCents: 0, minOrderCents: 0, acceptCash: true, acceptTransfer: false, transferAlias: null, transferHolder: null, autoConfirm: false, pendingAlertMinutes: 15 };

describe("esquemas de configuración", () => {
  it("exige al menos un medio de pago y el alias si hay transferencia", () => {
    expect(EnvioYPagos.safeParse(envio).success).toBe(true);
    expect(EnvioYPagos.safeParse({ ...envio, acceptCash: false }).error?.issues[0].path).toEqual(["acceptCash"]);
    expect(EnvioYPagos.safeParse({ ...envio, acceptTransfer: true }).error?.issues[0].path).toEqual(["transferAlias"]);
    expect(EnvioYPagos.safeParse({ ...envio, acceptTransfer: true, transferAlias: "  " }).success).toBe(false);
  });

  it("rechaza importes negativos o con decimales y avisos fuera de rango", () => {
    expect(EnvioYPagos.safeParse({ ...envio, deliveryFeeCents: -1 }).success).toBe(false);
    expect(EnvioYPagos.safeParse({ ...envio, minOrderCents: 10.5 }).success).toBe(false);
    expect(EnvioYPagos.safeParse({ ...envio, pendingAlertMinutes: 2 }).success).toBe(false);
  });

  it("horarios: minutos del día válidos, sin franjas de largo cero", () => {
    expect(Horarios.safeParse([{ weekday: 6, opensMin: 1200, closesMin: 120 }]).success).toBe(true);
    expect(Horarios.safeParse([{ weekday: 7, opensMin: 0, closesMin: 60 }]).success).toBe(false);
    expect(Horarios.safeParse([{ weekday: 1, opensMin: 600, closesMin: 600 }]).success).toBe(false);
    expect(Horarios.safeParse([{ weekday: 1, opensMin: 0, closesMin: 1440 }]).success).toBe(false);
  });

  it("el PATCH no acepta campos sueltos ni vacío", () => {
    expect(CambiosAjustes.safeParse({}).success).toBe(false);
    expect(CambiosAjustes.safeParse({ menuVersion: 1 }).success).toBe(false);
    expect(CambiosAjustes.safeParse({ horarios: [] }).success).toBe(true);
    expect(Pausa.safeParse({ paused: true, message: "" }).data).toEqual({ paused: true, message: null });
  });

  it("el logo tiene que venir del store de fotos", () => {
    const datos = { name: "Local", address: null, whatsapp: null, primaryColor: "#c2410c", showPhotos: true, showDescriptions: true };
    expect(CambiosAjustes.safeParse({ datos: { ...datos, logoUrl: "https://abc.public.blob.vercel-storage.com/logo.webp" } }).success).toBe(true);
    expect(CambiosAjustes.safeParse({ datos: { ...datos, logoUrl: "https://evil.example/logo.png" } }).success).toBe(false);
    expect(CambiosAjustes.safeParse({ datos: { ...datos, logoUrl: null, primaryColor: "red" } }).success).toBe(false);
  });
});

describe("usuarios", () => {
  it("valida el alta y no deja cambiar el email ni la contraseña por PATCH", () => {
    expect(UsuarioNuevo.safeParse({ name: "Ana", email: "ana@local.test", role: "STAFF" }).success).toBe(true);
    expect(UsuarioNuevo.safeParse({ name: "Ana", email: "no-es-email", role: "STAFF" }).success).toBe(false);
    expect(UsuarioNuevo.safeParse({ name: "Ana", email: "ana@local.test", role: "ADMIN" }).success).toBe(false);
    expect(UsuarioCambios.safeParse({ email: "otro@local.test" }).success).toBe(false);
    expect(UsuarioCambios.safeParse({ passwordHash: "x" }).success).toBe(false);
  });

  it("la contraseña temporal es legible, aceptable y distinta cada vez", () => {
    const claves = new Set(Array.from({ length: 50 }, generarContrasenaTemporal));
    expect(claves.size).toBe(50);
    for (const c of claves) {
      expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
      expect(c).not.toMatch(/[01ilo]/);
      expect(problemaConContrasena(c)).toBeNull();
    }
  });
});

describe("textos del historial", () => {
  const nombres = new Map([["p1", "Milanesa"]]);

  it("arma frases con el nombre y el detalle del cambio", () => {
    expect(describirRegistro({ action: "product.price_changed", entityId: "p1", before: { name: "Milanesa", priceCents: 950_000 }, after: { name: "Milanesa", priceCents: 1_000_000 } }, nombres)).toMatch(
      /^Cambió el precio de Milanesa: \$\s?9\.500 → \$\s?10\.000$/,
    );
    expect(describirRegistro({ action: "product.sold_out_changed", entityId: "p1", before: {}, after: { isSoldOut: true } }, nombres)).toBe("Cambió el agotado de Milanesa: agotado");
    expect(describirRegistro({ action: "user.role_changed", entityId: "u1", before: { name: "Ana" }, after: { role: "MANAGER" } }, nombres)).toBe("Cambió el rol de Ana (encargado)");
    expect(describirRegistro({ action: "settings.orders_paused", entityId: null, before: null, after: { pauseMessage: "Volvemos ya" } }, nombres)).toBe("Pausó los pedidos: “Volvemos ya”");
  });

  it("una acción desconocida se muestra tal cual en vez de romper", () => {
    expect(describirRegistro({ action: "algo.nuevo", entityId: null, before: null, after: null }, nombres)).toBe("algo.nuevo");
  });
});
