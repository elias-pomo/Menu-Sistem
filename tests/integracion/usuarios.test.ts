import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/bd";
import { crearSesion, iniciarSesion, type UsuarioSesion } from "@/modulos/autenticacion";
import { listarHistorial } from "@/modulos/auditoria";
import { cambiarUsuario, crearUsuario, listarUsuarios, restablecerContrasena } from "@/modulos/usuarios";
import { hayBase, sesionDe } from "./ayudantes";

/** Usuarios del local (Fase 6b, RF-037, RN-20) contra la base local con el seed. */
describe.skipIf(!hayBase)("usuarios del local (integración)", () => {
  const DOMINIO = "@usuarios-6b.test";
  let owner: UsuarioSesion;
  let manager: UsuarioSesion;
  let staff: UsuarioSesion;
  let ownerB: UsuarioSesion;
  const limpiar = async () => {
    const ids = (await db.appUser.findMany({ where: { email: { endsWith: DOMINIO } }, select: { id: true } })).map((u) => u.id);
    await db.auditLog.deleteMany({ where: { OR: [{ entityId: { in: ids } }, { userId: { in: ids } }] } });
    await db.appUser.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    [owner, manager, staff, ownerB] = await Promise.all([sesionDe("la-esquina", "OWNER"), sesionDe("la-esquina", "MANAGER"), sesionDe("la-esquina", "STAFF"), sesionDe("don-pepe", "OWNER")]);
    await limpiar();
  });
  afterAll(limpiar);

  it("solo el dueño gestiona usuarios", async () => {
    for (const s of [manager, staff]) {
      await expect(listarUsuarios(s)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(crearUsuario(s, { name: "X", email: `x${DOMINIO}`, role: "STAFF" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    const lista = await listarUsuarios(owner);
    expect(lista.every((u) => !("passwordHash" in u))).toBe(true);
    expect(lista.map((u) => u.email)).not.toContain("owner@don-pepe.test");
  });

  it("crea con una contraseña temporal que sirve para ingresar y no queda en la auditoría", async () => {
    const { usuario, contrasenaTemporal } = await crearUsuario(owner, { name: "Cajera Nueva", email: ` Cajera${DOMINIO} `, role: "STAFF" });
    expect(usuario.email).toBe(`cajera${DOMINIO}`);
    expect(contrasenaTemporal).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    await expect(iniciarSesion({ email: usuario.email, password: contrasenaTemporal, ip: null, userAgent: null })).resolves.toHaveProperty("token");
    const registro = await db.auditLog.findFirstOrThrow({ where: { action: "user.created", entityId: usuario.id } });
    expect(JSON.stringify(registro)).not.toContain(contrasenaTemporal);
  });

  it("no repite emails de toda la plataforma", async () => {
    await expect(crearUsuario(owner, { name: "Otro", email: "owner@don-pepe.test", role: "STAFF" })).rejects.toMatchObject({ code: "VALIDATION_ERROR", fields: { email: expect.any(String) } });
  });

  it("un usuario de otro negocio da 404", async () => {
    await expect(cambiarUsuario(owner, ownerB.userId, { name: "Hackeado" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(restablecerContrasena(owner, ownerB.userId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(cambiarUsuario(owner, "no-es-uuid", { name: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("nadie se desactiva ni se cambia el rol a sí mismo", async () => {
    await expect(cambiarUsuario(owner, owner.userId, { isActive: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cambiarUsuario(owner, owner.userId, { role: "STAFF" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("RN-20: no se puede dejar al negocio sin dueño activo, ni con dos dueños cambiándose a la vez", async () => {
    const { usuario: socia } = await crearUsuario(owner, { name: "Socia", email: `socia${DOMINIO}`, role: "OWNER" });
    try {
      // Con dos dueños, uno le puede bajar el rol al otro.
      await expect(cambiarUsuario(owner, socia.id, { role: "MANAGER" })).resolves.toMatchObject({ role: "MANAGER" });
      await cambiarUsuario(owner, socia.id, { role: "OWNER" });
      // Carrera: la socia ya le bajó el rol al dueño del seed y, al mismo tiempo, él intenta lo mismo
      // con ella. La segunda transacción ve que no quedaría ningún dueño activo y se deshace.
      await db.appUser.update({ where: { id: owner.userId }, data: { role: "MANAGER" } });
      await expect(cambiarUsuario(owner, socia.id, { role: "STAFF" })).rejects.toMatchObject({ code: "LAST_OWNER" });
      await expect(cambiarUsuario(owner, socia.id, { isActive: false })).rejects.toMatchObject({ code: "LAST_OWNER" });
      expect(await db.appUser.findUniqueOrThrow({ where: { id: socia.id }, select: { role: true, isActive: true } })).toEqual({ role: "OWNER", isActive: true });
    } finally {
      await db.appUser.update({ where: { id: owner.userId }, data: { role: "OWNER", isActive: true } });
      await db.appUser.update({ where: { id: socia.id }, data: { isActive: false } });
    }
  });

  it("desactivar cierra sus sesiones y borra sus avisos; reactivar lo deja volver", async () => {
    const { usuario, contrasenaTemporal } = await crearUsuario(owner, { name: "Mozo", email: `mozo${DOMINIO}`, role: "STAFF" });
    await crearSesion(usuario.id, null);
    await db.pushSubscription.create({ data: { businessId: owner.businessId, userId: usuario.id, endpoint: `https://push.test/mozo${Date.now()}`, p256dh: "p", auth: "a" } });
    await cambiarUsuario(owner, usuario.id, { isActive: false });
    expect(await db.session.count({ where: { userId: usuario.id } })).toBe(0);
    expect(await db.pushSubscription.count({ where: { userId: usuario.id } })).toBe(0);
    await expect(iniciarSesion({ email: usuario.email, password: contrasenaTemporal, ip: null, userAgent: null })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(restablecerContrasena(owner, usuario.id)).rejects.toMatchObject({ code: "EDIT_CONFLICT" });
    await cambiarUsuario(owner, usuario.id, { isActive: true });
    await expect(iniciarSesion({ email: usuario.email, password: contrasenaTemporal, ip: null, userAgent: null })).resolves.toHaveProperty("token");
  });

  it("restablecer da una contraseña nueva, invalida la anterior y cierra sesiones", async () => {
    const { usuario, contrasenaTemporal } = await crearUsuario(owner, { name: "Cocinero", email: `cocina${DOMINIO}`, role: "STAFF" });
    await crearSesion(usuario.id, null);
    const { contrasenaTemporal: nueva } = await restablecerContrasena(owner, usuario.id);
    expect(nueva).not.toBe(contrasenaTemporal);
    expect(await db.session.count({ where: { userId: usuario.id } })).toBe(0);
    await expect(iniciarSesion({ email: usuario.email, password: contrasenaTemporal, ip: null, userAgent: null })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(iniciarSesion({ email: usuario.email, password: nueva, ip: null, userAgent: null })).resolves.toHaveProperty("token");
    await expect(restablecerContrasena(owner, owner.userId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("el historial describe los cambios de usuarios", async () => {
    const { entries } = await listarHistorial(owner, null);
    const textos = entries.map((e) => e.description);
    expect(textos).toContain("Creó el usuario Cocinero (personal)");
    expect(textos).toContain("Desactivó a Mozo");
    expect(textos).toContain("Le dio una contraseña nueva a Cocinero");
  });
});
