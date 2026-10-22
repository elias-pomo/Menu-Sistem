/**
 * Seed determinista para desarrollo y tests (sección 14 del plan): 2 negocios (para las pruebas de
 * aislamiento), un usuario por rol en cada uno, 3 categorías y 12 productos con grupos de opciones y
 * casos límite, y 40 pedidos por negocio en todos los estados y varias fechas. Los importes de los
 * pedidos salen del mismo módulo de cálculo que usa la app.
 *
 * Borra y vuelve a crear solo los negocios del seed. Corre con la condición react-server para que
 * `server-only` no falle fuera de Next (ver prisma.config.ts).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/bd";
import { generarTokenPublico } from "@/lib/tokens";
import { hashearContrasena, problemaConContrasena } from "@/modulos/autenticacion";
import { cargarProductosParaPedido } from "@/modulos/menu";
import { fechaDeNegocio, negocioResuelto, type NegocioId } from "@/modulos/negocio";
import {
  calcularPedido,
  insertarPedido,
  type CarritoPedido,
  type EstadoPedido,
} from "@/modulos/pedidos";

const SLUGS_SEED = ["la-esquina", "don-pepe"] as const;

const NEGOCIOS = [
  {
    slug: "la-esquina",
    name: "La Esquina Comidas",
    address: "Mendoza 1200, San Miguel de Tucumán",
    whatsappE164: "+5493815550001",
    deliveryEnabled: true,
    deliveryFeeCents: 150_000,
    minOrderCents: 500_000,
    acceptTransfer: true,
    transferAlias: "laesquina.comidas",
    transferHolder: "La Esquina SRL",
  },
  {
    slug: "don-pepe",
    name: "Rotisería Don Pepe",
    address: "San Martín 450, San Miguel de Tucumán",
    whatsappE164: "+5493815550002",
    deliveryEnabled: false,
    deliveryFeeCents: 0,
    minOrderCents: 0,
    acceptTransfer: false,
    transferAlias: null,
    transferHolder: null,
  },
];

const ROLES = [
  { role: "OWNER", name: "Dueño" },
  { role: "MANAGER", name: "Encargada" },
  { role: "STAFF", name: "Personal" },
] as const;

/** Email de prueba de un usuario del seed: owner@la-esquina.test, staff@don-pepe.test, etc. */
const emailSeed = (slug: string, role: string) => `${role.toLowerCase()}@${slug}.test`;

// Generador pseudoaleatorio con semilla fija: el seed produce siempre los mismos pedidos.
function generador(semilla: number) {
  let estado = semilla;
  return () => {
    estado = (estado * 1_103_515_245 + 12_345) % 2 ** 31;
    return estado / 2 ** 31;
  };
}

async function borrarNegociosDelSeed() {
  const negocios = await db.business.findMany({ where: { slug: { in: [...SLUGS_SEED] } }, select: { id: true } });
  const ids = negocios.map((n) => n.id);
  if (!ids.length) return;
  const where = { businessId: { in: ids } };
  const usuarios = await db.appUser.findMany({ where, select: { id: true } });
  await db.$transaction([
    db.orderItemOption.deleteMany({ where }),
    db.orderItem.deleteMany({ where }),
    db.orderStatusHistory.deleteMany({ where }),
    db.order.deleteMany({ where }),
    db.auditLog.deleteMany({ where }),
    db.productOptionGroup.deleteMany({ where }),
    db.option.deleteMany({ where }),
    db.product.deleteMany({ where }),
    db.optionGroup.deleteMany({ where }),
    db.category.deleteMany({ where }),
    db.openingHour.deleteMany({ where }),
    db.pushSubscription.deleteMany({ where }),
    db.session.deleteMany({ where: { userId: { in: usuarios.map((u) => u.id) } } }),
    db.appUser.deleteMany({ where }),
    db.business.deleteMany({ where: { id: { in: ids } } }),
  ]);
}

async function crearMenu(businessId: NegocioId, prefijo: string) {
  const categoria = (name: string, position: number, isActive = true) =>
    db.category.create({ data: { businessId, name, position, isActive } });
  const [principales, minutas, bebidas] = await Promise.all([
    categoria("Platos del día", 0),
    categoria("Minutas", 1),
    categoria("Bebidas", 2),
  ]);
  const inactiva = await categoria("Postres (temporada)", 3, false);

  const guarnicion = await db.optionGroup.create({
    data: {
      businessId,
      name: "Guarnición",
      kind: "CHOICE",
      minSelect: 1,
      maxSelect: 1,
      options: {
        create: [
          { name: "Papas fritas", priceDeltaCents: 0, position: 0 },
          { name: "Puré", priceDeltaCents: 0, position: 1 },
          { name: "Ensalada", priceDeltaCents: 50_000, position: 2 },
          { name: "Papas rústicas", priceDeltaCents: 80_000, position: 3, isAvailable: false },
        ],
      },
    },
  });
  const extras = await db.optionGroup.create({
    data: {
      businessId,
      name: "Extras",
      kind: "CHOICE",
      minSelect: 0,
      maxSelect: 3,
      options: {
        create: [
          { name: "Huevo frito", priceDeltaCents: 60_000, position: 0 },
          { name: "Queso", priceDeltaCents: 70_000, position: 1 },
          { name: "Jamón", priceDeltaCents: 70_000, position: 2 },
          { name: "Panceta", priceDeltaCents: 90_000, position: 3 },
        ],
      },
    },
  });
  const sinIngredientes = await db.optionGroup.create({
    data: {
      businessId,
      name: "Sin ingredientes",
      kind: "REMOVE",
      minSelect: 0,
      maxSelect: 3,
      options: {
        create: [
          { name: "Sin cebolla", position: 0 },
          { name: "Sin tomate", position: 1 },
          { name: "Sin mayonesa", position: 2 },
        ],
      },
    },
  });

  const producto = async (
    categoryId: string,
    name: string,
    priceCents: number,
    extra: { position: number; groups?: string[]; isSoldOut?: boolean; archived?: boolean; tags?: string[]; description?: string },
  ) =>
    db.product.create({
      data: {
        businessId,
        categoryId,
        name: `${prefijo}${name}`,
        priceCents,
        position: extra.position,
        isSoldOut: extra.isSoldOut ?? false,
        archivedAt: extra.archived ? new Date() : null,
        tags: extra.tags ?? [],
        description: extra.description ?? null,
        optionGroups: { create: (extra.groups ?? []).map((groupId, position) => ({ groupId, position })) },
      },
    });

  const productos = {
    milanesa: await producto(principales.id, "Milanesa napolitana", 920_000, {
      position: 0,
      groups: [guarnicion.id, extras.id],
      tags: ["más pedido"],
      description: "Milanesa de ternera con salsa, jamón y queso.",
    }),
    pollo: await producto(principales.id, "Pollo al horno", 780_000, { position: 1, groups: [guarnicion.id] }),
    guiso: await producto(principales.id, "Guiso de lentejas", 650_000, { position: 2 }),
    lasagna: await producto(principales.id, "Lasaña de verdura", 850_000, { position: 3, isSoldOut: true }),
    hamburguesa: await producto(minutas.id, "Hamburguesa completa", 700_000, {
      position: 0,
      groups: [extras.id, sinIngredientes.id],
    }),
    lomito: await producto(minutas.id, "Sándwich de lomito", 980_000, { position: 1, groups: [sinIngredientes.id] }),
    empanadas: await producto(minutas.id, "Docena de empanadas de carne", 1_200_000, { position: 2 }),
    // Caso límite: nombre de exactamente 120 caracteres.
    largo: await producto(
      minutas.id,
      "Tarta de jamón y queso con masa casera y huevo duro, porción grande para compartir entre dos personas con ensalada".padEnd(
        120 - prefijo.length,
        ".",
      ),
      560_000,
      { position: 3 },
    ),
    gaseosa: await producto(bebidas.id, "Gaseosa 1,5 L", 300_000, { position: 0 }),
    agua: await producto(bebidas.id, "Agua sin gas 500 ml", 120_000, { position: 1 }),
    viejo: await producto(bebidas.id, "Cerveza (ya no se vende)", 400_000, { position: 2, archived: true }),
    flan: await producto(inactiva.id, "Flan casero", 350_000, { position: 0 }),
  };

  const opciones = await db.option.findMany({ where: { businessId } });
  const opcion = (name: string) => opciones.find((o) => o.name === name)!.id;
  return { productos, opcion };
}

type Menu = Awaited<ReturnType<typeof crearMenu>>;

/** Recorrido de estados para que un pedido llegue a `final`. */
function caminoHasta(final: EstadoPedido, fulfillment: "PICKUP" | "DELIVERY"): EstadoPedido[] {
  const camino: EstadoPedido[] =
    fulfillment === "DELIVERY"
      ? ["PENDING", "CONFIRMED", "PREPARING", "READY", "ON_THE_WAY", "DELIVERED"]
      : ["PENDING", "CONFIRMED", "PREPARING", "READY", "DELIVERED"];
  if (final === "CANCELLED") return ["PENDING", "CANCELLED"];
  return camino.slice(0, camino.indexOf(final) + 1);
}

async function crearPedidos(
  negocio: { id: NegocioId; deliveryEnabled: boolean; timezone: string },
  config: Parameters<typeof calcularPedido>[2],
  menu: Menu,
  usuarioId: string,
) {
  const azar = generador(negocio.deliveryEnabled ? 42 : 7);
  const { productos: p, opcion } = menu;
  const carritos: CarritoPedido["items"][] = [
    [{ productId: p.milanesa.id, quantity: 1, optionIds: [opcion("Papas fritas"), opcion("Huevo frito")], note: null }],
    [
      { productId: p.hamburguesa.id, quantity: 2, optionIds: [opcion("Queso"), opcion("Sin cebolla")], note: "bien cocida" },
      { productId: p.gaseosa.id, quantity: 1, optionIds: [], note: null },
    ],
    [{ productId: p.pollo.id, quantity: 1, optionIds: [opcion("Ensalada")], note: null }],
    [
      { productId: p.empanadas.id, quantity: 1, optionIds: [], note: "mitad picantes" },
      { productId: p.agua.id, quantity: 2, optionIds: [], note: null },
    ],
    [{ productId: p.lomito.id, quantity: 1, optionIds: [opcion("Sin tomate"), opcion("Sin mayonesa")], note: null }],
    [{ productId: p.guiso.id, quantity: 3, optionIds: [], note: null }],
  ];
  const finales: EstadoPedido[] = ["PENDING", "CONFIRMED", "PREPARING", "READY", "ON_THE_WAY", "DELIVERED", "CANCELLED"];
  const productosMenu = await cargarProductosParaPedido(
    db,
    negocio.id,
    Object.values(p).map((x) => x.id),
  );

  const ahora = Date.now();
  for (let i = 0; i < 40; i++) {
    const fulfillment = negocio.deliveryEnabled && azar() < 0.5 ? "DELIVERY" : "PICKUP";
    // Los activos son de hoy; los terminados se reparten en los últimos 30 días.
    let final = finales[i % finales.length];
    if (final === "ON_THE_WAY" && fulfillment === "PICKUP") final = "READY";
    const terminado = final === "DELIVERED" || final === "CANCELLED";
    const creado = new Date(ahora - (terminado ? Math.floor(azar() * 30) * 86_400_000 : 0) - (i + 1) * 7 * 60_000);

    const carrito: CarritoPedido = {
      fulfillment,
      paymentMethod: config.acceptTransfer && azar() < 0.4 ? "TRANSFER" : "CASH",
      items: carritos[i % carritos.length],
    };
    const calculo = calcularPedido(carrito, productosMenu, config);
    if (!calculo.ok) throw new Error(`El carrito ${i % carritos.length} del seed no es válido: ${JSON.stringify(calculo)}`);

    const camino = caminoHasta(final, fulfillment);
    await db.$transaction(async (tx) => {
      const pedido = await insertarPedido(tx, negocio.id, {
        businessDate: new Date(`${fechaDeNegocio(creado, negocio.timezone)}T00:00:00Z`),
        // Determinista y sin repetirse en el mismo día: el número de pedido en base 31 con relleno.
        publicCode: codigoSeed(i, negocio.deliveryEnabled ? 0 : 1),
        publicToken: generarTokenPublico(),
        clientRequestId: randomUUID(),
        status: "PENDING",
        fulfillment,
        customerName: ["Ana Pérez", "Juan Gómez", "María López", "Carlos Díaz", "Lucía Romero"][i % 5],
        customerPhone: `+54938155510${String(i).padStart(2, "0")}`,
        address:
          fulfillment === "DELIVERY"
            ? { street: "Mendoza", number: String(1000 + i * 10), neighborhood: "Centro", unit: i % 3 === 0 ? "2B" : null, reference: null }
            : undefined,
        note: i % 4 === 0 ? "Tocar timbre" : null,
        paymentMethod: carrito.paymentMethod,
        cashChangeForCents: carrito.paymentMethod === "CASH" && i % 3 === 0 ? 2_000_000 : null,
        lines: calculo.lines,
        subtotalCents: calculo.subtotalCents,
        deliveryFeeCents: calculo.deliveryFeeCents,
        totalCents: calculo.totalCents,
        createdAt: creado,
      });

      // Recorre el camino de estados dejando el historial, con unos minutos entre cada paso.
      let momento = creado.getTime();
      for (let paso = 1; paso < camino.length; paso++) {
        momento += 6 * 60_000;
        const to = camino[paso];
        const cuando = new Date(momento);
        await tx.order.update({
          where: { id: pedido.id },
          data: {
            status: to,
            ...(to === "CONFIRMED" && { confirmedAt: cuando, estimatedMinutes: 30 }),
            ...(to === "READY" && { readyAt: cuando }),
            ...(to === "DELIVERED" && { deliveredAt: cuando, paidAt: cuando, paidBy: usuarioId }),
            ...(to === "CANCELLED" && { cancelledAt: cuando, cancelReason: "OUT_OF_STOCK" as const }),
          },
        });
        await tx.orderStatusHistory.create({
          data: {
            businessId: negocio.id,
            orderId: pedido.id,
            fromStatus: camino[paso - 1],
            toStatus: to,
            userId: usuarioId,
            reason: to === "CANCELLED" ? "OUT_OF_STOCK" : null,
            createdAt: cuando,
          },
        });
      }
    });
  }
}

const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function codigoSeed(i: number, negocio: number) {
  const n = i * 7 + negocio * 997 + 1000;
  let codigo = "";
  for (let x = n, k = 0; k < 4; k++, x = Math.floor(x / ALFABETO.length)) codigo = ALFABETO[x % ALFABETO.length] + codigo;
  return codigo;
}

async function main() {
  const contrasena = process.env.SEED_PASSWORD ?? "";
  const problema = problemaConContrasena(contrasena);
  if (problema) throw new Error(`SEED_PASSWORD: ${problema} Configurala en .env (ver .env.example).`);
  const passwordHash = await hashearContrasena(contrasena);

  await borrarNegociosDelSeed();

  for (const [indice, datos] of NEGOCIOS.entries()) {
    const creado = await db.business.create({
      data: {
        ...datos,
        acceptCash: true,
        openingHours: {
          // Mediodía y noche de lunes a sábado; la noche del sábado cruza la medianoche.
          create: [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
            { weekday, opensMin: 11 * 60, closesMin: 15 * 60 },
            { weekday, opensMin: 19 * 60 + 30, closesMin: weekday === 6 ? 60 : 23 * 60 + 30 },
          ]),
        },
      },
    });
    const businessId = negocioResuelto(creado.id);

    const usuarios = [];
    for (const { role, name } of ROLES) {
      usuarios.push(
        await db.appUser.create({
          data: { businessId, email: emailSeed(datos.slug, role), name: `${name} ${datos.name}`, role, passwordHash },
        }),
      );
    }

    const menu = await crearMenu(businessId, indice === 0 ? "" : "DP ");
    await crearPedidos(
      { id: businessId, deliveryEnabled: creado.deliveryEnabled, timezone: creado.timezone },
      {
        deliveryEnabled: creado.deliveryEnabled,
        deliveryFeeCents: creado.deliveryFeeCents,
        minOrderCents: creado.minOrderCents,
        acceptCash: creado.acceptCash,
        acceptTransfer: creado.acceptTransfer,
      },
      menu,
      usuarios[2].id,
    );
    console.log(`Negocio ${datos.slug}: 3 usuarios, 12 productos, 40 pedidos.`);
  }
  console.log("Usuarios: owner|manager|staff@<slug>.test con la contraseña de SEED_PASSWORD.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
