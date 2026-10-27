import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/bd";
import { guardarAjustes, obtenerAjustes, pausarPedidos, type EnvioYPagosDatos } from "@/modulos/ajustes";
import { listarHistorial } from "@/modulos/auditoria";
import type { UsuarioSesion } from "@/modulos/autenticacion";
import { negocioSeed, hayBase, sesionDe } from "./ayudantes";

/** Configuración del negocio (Fase 6b) contra la base local con el seed. Restaura todo al final. */
describe.skipIf(!hayBase)("configuración del negocio (integración)", () => {
  let owner: UsuarioSesion;
  let manager: UsuarioSesion;
  let staff: UsuarioSesion;
  let ownerB: UsuarioSesion;
  let original: Awaited<ReturnType<typeof negocioSeed>> & { openingHours: { weekday: number; opensMin: number; closesMin: number }[] };
  let originalB: { deliveryFeeCents: number };
  const inicio = new Date();

  const envio = (cambios: Partial<EnvioYPagosDatos> = {}): EnvioYPagosDatos => ({
    deliveryEnabled: true,
    deliveryFeeCents: 150_000,
    minOrderCents: 500_000,
    acceptCash: true,
    acceptTransfer: true,
    transferAlias: "la.esquina.mp",
    transferHolder: "La Esquina SRL",
    autoConfirm: false,
    pendingAlertMinutes: 15,
    ...cambios,
  });

  beforeAll(async () => {
    [owner, manager, staff, ownerB] = await Promise.all([sesionDe("la-esquina", "OWNER"), sesionDe("la-esquina", "MANAGER"), sesionDe("la-esquina", "STAFF"), sesionDe("don-pepe", "OWNER")]);
    const negocio = await negocioSeed("la-esquina");
    const horas = await db.openingHour.findMany({ where: { businessId: negocio.id }, select: { weekday: true, opensMin: true, closesMin: true } });
    original = { ...negocio, openingHours: horas };
    originalB = await db.business.findUniqueOrThrow({ where: { id: ownerB.businessId }, select: { deliveryFeeCents: true } });
  });

  afterAll(async () => {
    const { id, openingHours, name, address, whatsappE164, logoUrl, primaryColor, showPhotos, showDescriptions, acceptingOrders, pauseMessage } = original;
    const { deliveryEnabled, deliveryFeeCents, minOrderCents, acceptCash, acceptTransfer, transferAlias, transferHolder, autoConfirm, pendingAlertMinutes } = original;
    await db.business.update({
      where: { id },
      data: { name, address, whatsappE164, logoUrl, primaryColor, showPhotos, showDescriptions, acceptingOrders, pauseMessage },
    });
    await db.business.update({
      where: { id },
      data: { deliveryEnabled, deliveryFeeCents, minOrderCents, acceptCash, acceptTransfer, transferAlias, transferHolder, autoConfirm, pendingAlertMinutes },
    });
    await db.openingHour.deleteMany({ where: { businessId: id } });
    await db.openingHour.createMany({ data: openingHours.map((h) => ({ businessId: id, ...h })) });
    await db.auditLog.deleteMany({ where: { businessId: id, action: { startsWith: "settings." }, createdAt: { gte: inicio } } });
  });

  it("matriz de permisos: datos y horarios el encargado; envío y pagos solo el dueño", async () => {
    const datos = { name: original.name, address: original.address, whatsapp: null, logoUrl: null, primaryColor: "#123456", showPhotos: true, showDescriptions: true };
    await expect(guardarAjustes(staff, { datos })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(guardarAjustes(manager, { datos })).resolves.toMatchObject({ primaryColor: "#123456" });
    await expect(guardarAjustes(staff, { horarios: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(guardarAjustes(manager, { envioYPagos: envio() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(guardarAjustes(owner, { envioYPagos: envio() })).resolves.toMatchObject({ deliveryFeeCents: 150_000 });
    expect((await obtenerAjustes(staff)).puede).toEqual({ datos: false, horarios: false, envioYPagos: false });
    expect((await obtenerAjustes(manager)).puede).toEqual({ datos: true, horarios: true, envioYPagos: false });
  });

  it("si una sección no está permitida no se guarda ninguna", async () => {
    const antes = await db.business.findUniqueOrThrow({ where: { id: manager.businessId }, select: { name: true } });
    const datos = { name: "No se guarda", address: null, whatsapp: null, logoUrl: null, primaryColor: "#123456", showPhotos: true, showDescriptions: true };
    await expect(guardarAjustes(manager, { datos, envioYPagos: envio() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.business.findUniqueOrThrow({ where: { id: manager.businessId }, select: { name: true } })).toEqual(antes);
  });

  it("solo cambia el negocio de la sesión", async () => {
    await guardarAjustes(owner, { envioYPagos: envio({ deliveryFeeCents: 99_900 }) });
    expect(await db.business.findUniqueOrThrow({ where: { id: ownerB.businessId }, select: { deliveryFeeCents: true } })).toEqual(originalB);
  });

  it("normaliza el WhatsApp y rechaza uno inválido", async () => {
    const base = { name: original.name, address: null, logoUrl: null, primaryColor: "#c2410c", showPhotos: true, showDescriptions: true };
    await expect(guardarAjustes(manager, { datos: { ...base, whatsapp: "0381 15-555-1234" } })).resolves.toMatchObject({ whatsappE164: "+5493815551234" });
    await expect(guardarAjustes(manager, { datos: { ...base, whatsapp: "123" } })).rejects.toMatchObject({ code: "VALIDATION_ERROR", fields: { "datos.whatsapp": expect.any(String) } });
  });

  it("sin delivery el envío queda en 0 y sin transferencia se borra el alias", async () => {
    const r = await guardarAjustes(owner, { envioYPagos: envio({ deliveryEnabled: false, acceptTransfer: false }) });
    expect(r).toMatchObject({ deliveryEnabled: false, deliveryFeeCents: 0, acceptTransfer: false, transferAlias: null, transferHolder: null });
  });

  it("los horarios reemplazan todas las franjas, ordenadas y sin repetidas", async () => {
    const franjas = [
      { weekday: 5, opensMin: 1200, closesMin: 60 },
      { weekday: 1, opensMin: 1200, closesMin: 1410 },
      { weekday: 1, opensMin: 660, closesMin: 900 },
      { weekday: 1, opensMin: 660, closesMin: 900 },
    ];
    const r = await guardarAjustes(manager, { horarios: franjas });
    expect(r.openingHours).toEqual([
      { weekday: 1, opensMin: 660, closesMin: 900 },
      { weekday: 1, opensMin: 1200, closesMin: 1410 },
      { weekday: 5, opensMin: 1200, closesMin: 60 },
    ]);
  });

  it("cualquier usuario pausa y reanuda; el mensaje se borra al reanudar", async () => {
    await expect(pausarPedidos(staff, { paused: true, message: "Volvemos en 30 minutos." })).resolves.toEqual({ acceptingOrders: false, pauseMessage: "Volvemos en 30 minutos." });
    await expect(pausarPedidos(staff, { paused: false, message: "ignorado" })).resolves.toEqual({ acceptingOrders: true, pauseMessage: null });
  });

  it("cada cambio queda en el historial, que solo ve el dueño", async () => {
    await expect(listarHistorial(manager, null)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { entries } = await listarHistorial(owner, null);
    const textos = entries.map((e) => e.description);
    expect(textos).toContain("Cambió envío y pagos");
    expect(textos).toContain("Cambió los horarios");
    expect(textos.some((t) => t.startsWith("Pausó los pedidos"))).toBe(true);
    expect(entries.find((e) => e.description === "Reanudó los pedidos")?.user).toBe(staff.name);
    const otro = await listarHistorial(ownerB, null);
    expect(otro.entries.map((e) => e.id)).not.toContain(entries[0].id);
  });
});
