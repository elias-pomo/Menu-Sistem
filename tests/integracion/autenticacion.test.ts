import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/bd";
import { sha256Hex } from "@/lib/tokens";
import { cambiarContrasena, cerrarSesion, iniciarSesion, LIMITE_LOGIN, validarSesion } from "@/modulos/autenticacion";
import { hayBase } from "./ayudantes";

const EMAIL = "staff@la-esquina.test";
const IP = "10.20.30.40";
const CLAVE = process.env.SEED_PASSWORD ?? "";

async function limpiarLimites() {
  await db.rateLimitHit.deleteMany({ where: { key: { startsWith: "login-" } } });
}

describe.skipIf(!hayBase || !CLAVE)("autenticación (integración)", () => {
  beforeEach(limpiarLimites);

  afterAll(async () => {
    await limpiarLimites();
    await db.appUser.update({ where: { email: EMAIL }, data: { isActive: true } });
    await db.$disconnect();
  });

  it("login correcto crea una sesión; en la base se guarda solo el hash del token", async () => {
    const { token } = await iniciarSesion({ email: "  STAFF@la-esquina.test ", password: CLAVE, ip: IP, userAgent: "test" });
    expect(await db.session.findUnique({ where: { id: token } })).toBeNull();
    expect(await db.session.findUnique({ where: { id: sha256Hex(token) } })).not.toBeNull();

    const sesion = await validarSesion(token);
    expect(sesion).toMatchObject({ email: EMAIL, role: "STAFF" });
    await cerrarSesion(token);
    expect(await validarSesion(token)).toBeNull();
  });

  it("contraseña incorrecta y email inexistente dan el mismo error genérico", async () => {
    await expect(iniciarSesion({ email: EMAIL, password: "incorrecta-123", ip: IP, userAgent: null })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Datos incorrectos.",
    });
    await expect(iniciarSesion({ email: "nadie@nada.test", password: "incorrecta-123", ip: "10.0.0.9", userAgent: null })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Datos incorrectos.",
    });
  });

  it("el 6.º intento fallido por email queda bloqueado (429), incluso con la contraseña correcta", async () => {
    for (let i = 0; i < LIMITE_LOGIN.porEmail; i++) {
      await expect(iniciarSesion({ email: EMAIL, password: "incorrecta-123", ip: `10.1.1.${i}`, userAgent: null })).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    }
    await expect(iniciarSesion({ email: EMAIL, password: CLAVE, ip: "10.1.1.99", userAgent: null })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("también bloquea por IP aunque cambie el email", async () => {
    for (let i = 0; i < LIMITE_LOGIN.porIp; i++) {
      await expect(iniciarSesion({ email: `x${i}@nada.test`, password: "incorrecta-123", ip: IP, userAgent: null })).rejects.toThrow();
    }
    await expect(iniciarSesion({ email: EMAIL, password: CLAVE, ip: IP, userAgent: null })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("la sesión vencida no vale y se borra", async () => {
    const { token } = await iniciarSesion({ email: EMAIL, password: CLAVE, ip: IP, userAgent: null });
    expect(await validarSesion(token, new Date(Date.now() + 15 * 86_400_000))).toBeNull();
    expect(await db.session.findUnique({ where: { id: sha256Hex(token) } })).toBeNull();
  });

  it("se renueva sola cuando pasó la mitad de su vida", async () => {
    const { token, expiresAt } = await iniciarSesion({ email: EMAIL, password: CLAVE, ip: IP, userAgent: null });
    const enOchoDias = new Date(Date.now() + 8 * 86_400_000);
    const sesion = await validarSesion(token, enOchoDias);
    expect(sesion!.expiresAt.getTime()).toBeGreaterThan(expiresAt.getTime());
    await cerrarSesion(token);
  });

  it("desactivar un usuario invalida sus sesiones (T8)", async () => {
    const { token } = await iniciarSesion({ email: EMAIL, password: CLAVE, ip: IP, userAgent: null });
    await db.appUser.update({ where: { email: EMAIL }, data: { isActive: false } });
    expect(await validarSesion(token)).toBeNull();
    await expect(iniciarSesion({ email: EMAIL, password: CLAVE, ip: "10.9.9.9", userAgent: null })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await db.appUser.update({ where: { email: EMAIL }, data: { isActive: true } });
  });

  it("cambiar la contraseña cierra las otras sesiones, no la actual", async () => {
    const otra = await iniciarSesion({ email: EMAIL, password: CLAVE, ip: IP, userAgent: "celular" });
    const actual = await iniciarSesion({ email: EMAIL, password: CLAVE, ip: IP, userAgent: "tablet" });
    const sesion = (await validarSesion(actual.token))!;
    const nueva = `${CLAVE}-nueva`;

    await expect(
      cambiarContrasena({ userId: sesion.userId, sessionHash: sesion.sessionHash, actual: "incorrecta-123", nueva }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await cambiarContrasena({ userId: sesion.userId, sessionHash: sesion.sessionHash, actual: CLAVE, nueva });
    try {
      expect(await validarSesion(otra.token)).toBeNull();
      expect(await validarSesion(actual.token)).not.toBeNull();
      expect(await db.auditLog.count({ where: { userId: sesion.userId, action: "auth.password_changed" } })).toBeGreaterThan(0);
    } finally {
      await cambiarContrasena({ userId: sesion.userId, sessionHash: sesion.sessionHash, actual: nueva, nueva: CLAVE });
      await cerrarSesion(actual.token);
    }
  });
});
