import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/bd";
import type { UsuarioSesion } from "@/modulos/autenticacion";
import { desuscribir, enviarAlNegocio, suscribir, type MensajePush } from "@/modulos/notificaciones";
import { hayBase, sesionDe } from "./ayudantes";

/** Suscripciones push del panel (Fase 5b) contra la base local con el seed. El envío real se simula. */
describe.skipIf(!hayBase)("push del panel (integración)", () => {
  const PREFIJO = "https://push.test/";
  const mensaje: MensajePush = { title: "Pedido nuevo T3ST", body: "Retiro", tag: "pedido-T3ST", url: "/admin" };
  let staffA: UsuarioSesion;
  let ownerA: UsuarioSesion;
  let staffB: UsuarioSesion;

  const sub = (n: string) => ({ endpoint: `${PREFIJO}${n}`, keys: { p256dh: `p256-${n}`, auth: `auth-${n}` } });
  const limpiar = () => db.pushSubscription.deleteMany({ where: { endpoint: { startsWith: PREFIJO } } });

  beforeAll(async () => {
    [staffA, ownerA, staffB] = await Promise.all([sesionDe("la-esquina", "STAFF"), sesionDe("la-esquina", "OWNER"), sesionDe("don-pepe", "STAFF")]);
    await limpiar();
  });
  afterAll(limpiar);

  it("una suscripción por navegador: el mismo endpoint pasa al último usuario que ingresó", async () => {
    await suscribir(staffA, sub("compartido"));
    await suscribir(ownerA, { ...sub("compartido"), keys: { p256dh: "nueva", auth: "nueva" } });
    const filas = await db.pushSubscription.findMany({ where: { endpoint: `${PREFIJO}compartido` } });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ userId: ownerA.userId, businessId: ownerA.businessId, p256dh: "nueva" });
  });

  it("un dispositivo que pasa a otro negocio deja de recibir los avisos del anterior", async () => {
    await suscribir(staffA, sub("mudado"));
    await suscribir(staffB, sub("mudado"));
    const destinos: string[] = [];
    await enviarAlNegocio(staffA.businessId, mensaje, async (d) => void destinos.push(d.endpoint));
    expect(destinos).not.toContain(`${PREFIJO}mudado`);
  });

  it("envía solo a los navegadores del negocio, con el mensaje en JSON", async () => {
    await suscribir(staffA, sub("a1"));
    await suscribir(staffB, sub("b1"));
    const enviados: { endpoint: string; cuerpo: string }[] = [];
    const r = await enviarAlNegocio(staffA.businessId, mensaje, async (d, cuerpo) => void enviados.push({ endpoint: d.endpoint, cuerpo }));
    const propios = enviados.filter((e) => e.endpoint.startsWith(PREFIJO));
    expect(propios.map((e) => e.endpoint).sort()).toEqual([`${PREFIJO}a1`, `${PREFIJO}compartido`]);
    expect(JSON.parse(propios[0].cuerpo)).toEqual(mensaje);
    expect(r.enviados).toBeGreaterThanOrEqual(2);
  });

  it("borra las suscripciones vencidas (404/410) y no corta por otros errores", async () => {
    await suscribir(staffA, sub("vencida"));
    await suscribir(staffA, sub("caida"));
    const r = await enviarAlNegocio(staffA.businessId, mensaje, async (d) => {
      if (d.endpoint.endsWith("vencida")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      if (d.endpoint.endsWith("caida")) throw Object.assign(new Error("Server error"), { statusCode: 500 });
    });
    expect(r.borrados).toBeGreaterThanOrEqual(1);
    expect(await db.pushSubscription.count({ where: { endpoint: `${PREFIJO}vencida` } })).toBe(0);
    expect(await db.pushSubscription.count({ where: { endpoint: `${PREFIJO}caida` } })).toBe(1);
  });

  it("la baja solo borra el navegador del mismo usuario y negocio", async () => {
    await suscribir(staffA, sub("baja"));
    await desuscribir(staffB, `${PREFIJO}baja`);
    await desuscribir(ownerA, `${PREFIJO}baja`);
    expect(await db.pushSubscription.count({ where: { endpoint: `${PREFIJO}baja` } })).toBe(1);
    await desuscribir(staffA, `${PREFIJO}baja`);
    expect(await db.pushSubscription.count({ where: { endpoint: `${PREFIJO}baja` } })).toBe(0);
  });

  it("no avisa a usuarios desactivados", async () => {
    await suscribir(staffA, sub("inactivo"));
    await db.appUser.update({ where: { id: staffA.userId }, data: { isActive: false } });
    try {
      const destinos: string[] = [];
      await enviarAlNegocio(staffA.businessId, mensaje, async (d) => void destinos.push(d.endpoint));
      expect(destinos).not.toContain(`${PREFIJO}inactivo`);
    } finally {
      await db.appUser.update({ where: { id: staffA.userId }, data: { isActive: true } });
    }
  });
});
