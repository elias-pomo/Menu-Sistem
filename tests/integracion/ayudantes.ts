import { randomUUID } from "node:crypto";
import { db } from "@/lib/bd";
import { generarCodigoCorto, generarTokenPublico } from "@/lib/tokens";
import type { Rol, UsuarioSesion } from "@/modulos/autenticacion";
import { cargarProductosParaPedido } from "@/modulos/menu";
import { fechaDeNegocio, negocioDeSesion, negocioResuelto, type NegocioId } from "@/modulos/negocio";
import { calcularPedido, insertarPedido } from "@/modulos/pedidos";

/**
 * Ayudantes de los tests de integración. Usan la base local con el seed cargado
 * (`npm run db:seed`): negocios la-esquina y don-pepe, con un usuario por rol cada uno.
 */

export const hayBase = Boolean(process.env.DATABASE_URL);

export async function negocioSeed(slug: "la-esquina" | "don-pepe") {
  const negocio = await db.business.findUniqueOrThrow({ where: { slug } });
  return { ...negocio, id: negocioResuelto(negocio.id) };
}

/** Sesión armada a mano para un usuario del seed (sin pasar por la cookie). */
export async function sesionDe(slug: "la-esquina" | "don-pepe", role: Rol): Promise<UsuarioSesion> {
  const usuario = await db.appUser.findUniqueOrThrow({ where: { email: `${role.toLowerCase()}@${slug}.test` } });
  return {
    userId: usuario.id,
    businessId: negocioDeSesion(usuario.businessId),
    role: usuario.role,
    name: usuario.name,
    email: usuario.email,
    sessionHash: "test",
    expiresAt: new Date(Date.now() + 86_400_000),
  };
}

/** Pedido nuevo en PENDING (retiro, una gaseosa y una milanesa), creado con el módulo de cálculo. */
export async function crearPedidoDePrueba(businessId: NegocioId, fulfillment: "PICKUP" | "DELIVERY" = "PICKUP") {
  const negocio = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  const productos = await db.product.findMany({ where: { businessId, archivedAt: null, isSoldOut: false } });
  const milanesa = productos.find((p) => p.name.endsWith("Milanesa napolitana"))!;
  const gaseosa = productos.find((p) => p.name.endsWith("Gaseosa 1,5 L"))!;
  const papas = await db.option.findFirstOrThrow({ where: { businessId, name: "Papas fritas" } });

  const menu = await cargarProductosParaPedido(db, businessId, [milanesa.id, gaseosa.id]);
  const calculo = calcularPedido(
    {
      fulfillment,
      paymentMethod: "CASH",
      items: [
        { productId: milanesa.id, quantity: 1, optionIds: [papas.id], note: null },
        { productId: gaseosa.id, quantity: 1, optionIds: [], note: null },
      ],
    },
    menu,
    negocio,
  );
  if (!calculo.ok) throw new Error(`carrito de prueba inválido: ${JSON.stringify(calculo)}`);

  const ahora = new Date();
  return db.$transaction((tx) =>
    insertarPedido(tx, businessId, {
      businessDate: new Date(`${fechaDeNegocio(ahora, negocio.timezone)}T00:00:00Z`),
      publicCode: generarCodigoCorto(),
      publicToken: generarTokenPublico(),
      clientRequestId: randomUUID(),
      status: "PENDING",
      fulfillment,
      customerName: "Cliente de prueba",
      customerPhone: "+5493815559999",
      address: fulfillment === "DELIVERY" ? { street: "Test", number: "1", neighborhood: "Centro" } : undefined,
      note: null,
      paymentMethod: "CASH",
      cashChangeForCents: null,
      lines: calculo.lines,
      subtotalCents: calculo.subtotalCents,
      deliveryFeeCents: calculo.deliveryFeeCents,
      totalCents: calculo.totalCents,
    }),
  );
}

/** Borra los pedidos creados por un test (en orden, por las claves foráneas). */
export async function borrarPedidos(ids: string[]) {
  if (!ids.length) return;
  const items = await db.orderItem.findMany({ where: { orderId: { in: ids } }, select: { id: true } });
  await db.$transaction([
    db.orderItemOption.deleteMany({ where: { orderItemId: { in: items.map((i) => i.id) } } }),
    db.orderItem.deleteMany({ where: { orderId: { in: ids } } }),
    db.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } }),
    db.auditLog.deleteMany({ where: { entityId: { in: ids } } }),
    db.order.deleteMany({ where: { id: { in: ids } } }),
  ]);
}
