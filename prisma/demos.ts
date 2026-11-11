/**
 * Tres negocios de demostración para probar el sistema de punta a punta, en local y en producción:
 *
 * - Pizzería La Fugazza: de noche, con horarios que cruzan la medianoche, delivery con mínimo,
 *   tamaño obligatorio, media y media (2 gustos), adicionales y empanadas por unidad.
 * - Restó Los Arrayanes: restaurante con platos variados, mediodía y noche, guarnición, punto de la
 *   carne, salsa de pastas, "sin ingredientes" y carta de vinos.
 * - Café Alma: cafetería, panadería y pastelería con horario corrido, envío gratis con mínimo alto,
 *   color claro (texto oscuro automático), sin descripciones, porción o torta entera.
 *
 * Cada uno trae dueño, encargado y personal (`dueno|encargado|personal@<slug>.test` con la contraseña
 * de DEMO_PASSWORD), unos 55 pedidos de los últimos 30 días dentro de su horario y algunos pedidos de
 * hoy en curso. Los importes salen del mismo cálculo que usa la app. Datos de clientes inventados.
 *
 * Si un negocio ya existe no se toca; con `--reset` se borran y se vuelven a crear (solo los demos).
 *
 *   npm run db:demos            (base local)
 *   npm run db:prod:demos       (Neon, con .env.produccion)
 */
import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import { db } from "@/lib/bd";
import { generarTokenPublico } from "@/lib/tokens";
// Directo de contrasenas: el index de autenticación arrastra next/navigation, que no carga fuera de Next.
import { hashearContrasena, problemaConContrasena } from "@/modulos/autenticacion/contrasenas";
import { cargarProductosParaPedido } from "@/modulos/menu";
import { fechaDeNegocio, negocioResuelto, type NegocioId } from "@/modulos/negocio";
import { calcularPedido, insertarPedido, type CarritoPedido, type EstadoPedido } from "@/modulos/pedidos";

const pesos = (n: number) => n * 100;

type Opcion = [nombre: string, adicional?: number, noDisponible?: boolean];
type Grupo = { name: string; kind?: "CHOICE" | "REMOVE"; min: number; max: number; opciones: Opcion[] };
type Producto = { n: string; p: number; d?: string; g?: string[]; t?: string[]; agotado?: boolean; oculto?: boolean };
type Categoria = { nombre: string; bebida?: boolean; productos: Producto[] };
type Franja = [weekday: number, abre: string, cierra: string];

type Demo = {
  slug: string;
  name: string;
  address: string;
  whatsappE164: string;
  primaryColor: string;
  menuStyle: "NOCTURNO" | "MANTEL" | "MOSTRADOR";
  deliveryEnabled: boolean;
  deliveryFeeCents: number;
  minOrderCents: number;
  acceptTransfer: boolean;
  transferAlias: string | null;
  transferHolder: string | null;
  showDescriptions: boolean;
  pendingAlertMinutes: number;
  /** 0 = domingo. Si el cierre es menor o igual a la apertura, la franja cruza la medianoche. */
  horarios: Franja[];
  grupos: Record<string, Grupo>;
  categorias: Categoria[];
  /** Peso de cada día de la semana (0 = domingo) para repartir el historial. */
  demanda: number[];
  minutosEstimados: [number, number];
};

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// ─── Pizzería ────────────────────────────────────────────────────────────────

const PIZZERIA: Demo = {
  slug: "demo-pizzeria",
  name: "Pizzería La Fugazza (demo)",
  address: "Av. Sarmiento 820, San Miguel de Tucumán",
  whatsappE164: "+5493815550101",
  primaryColor: "#9f1239",
  menuStyle: "NOCTURNO",
  deliveryEnabled: true,
  deliveryFeeCents: pesos(2_000),
  minOrderCents: pesos(15_000),
  acceptTransfer: true,
  transferAlias: "lafugazza.demo",
  transferHolder: "La Fugazza (demo)",
  showDescriptions: true,
  pendingAlertMinutes: 15,
  // Lunes cerrado; martes a jueves hasta las 00:30; viernes y sábado hasta las 02:00; domingo hasta las 00:00.
  horarios: [
    [0, "19:30", "00:00"],
    [2, "19:30", "00:30"],
    [3, "19:30", "00:30"],
    [4, "19:30", "00:30"],
    [5, "19:30", "02:00"],
    [6, "19:30", "02:00"],
  ],
  grupos: {
    tamano: { name: "Tamaño", min: 1, max: 1, opciones: [["Mediana (6 porciones)"], ["Grande (8 porciones)", 3_500], ["Familiar (12 porciones)", 7_500]] },
    adicionales: {
      name: "Adicionales",
      min: 0,
      max: 3,
      opciones: [["Extra muzzarella", 2_500], ["Jamón", 2_000], ["Morrones", 1_500], ["Aceitunas negras", 1_200], ["Huevo", 1_000], ["Rúcula", 1_500, true]],
    },
    gustos: {
      name: "Elegí los 2 gustos",
      min: 2,
      max: 2,
      opciones: [["Muzzarella"], ["Napolitana"], ["Fugazzeta"], ["Calabresa"], ["Jamón y morrones"], ["Roquefort", 1_000], ["Cuatro quesos", 1_500], ["Palmitos", 1_500, true]],
    },
    sinPizza: { name: "Sin ingredientes", kind: "REMOVE", min: 0, max: 3, opciones: [["Sin aceitunas"], ["Sin orégano"], ["Sin ajo"]] },
    coccion: { name: "Cocción", min: 1, max: 1, opciones: [["Al horno"], ["Fritas"]] },
  },
  categorias: [
    {
      nombre: "Pizzas clásicas",
      productos: [
        { n: "Muzzarella", p: 11_000, d: "Salsa de tomate, muzzarella y aceitunas.", g: ["tamano", "adicionales", "sinPizza"], t: ["más pedida"] },
        { n: "Napolitana", p: 12_500, d: "Muzzarella, rodajas de tomate, ajo y perejil.", g: ["tamano", "adicionales", "sinPizza"] },
        { n: "Fugazzeta", p: 12_500, d: "Cebolla, muzzarella y orégano.", g: ["tamano", "adicionales", "sinPizza"] },
        { n: "Calabresa", p: 13_000, d: "Muzzarella y longaniza calabresa.", g: ["tamano", "adicionales", "sinPizza"] },
        { n: "Jamón y morrones", p: 13_500, d: "Muzzarella, jamón cocido y morrones asados.", g: ["tamano", "adicionales", "sinPizza"] },
        { n: "Especial", p: 14_500, d: "Jamón, morrones, huevo duro y aceitunas.", g: ["tamano", "adicionales", "sinPizza"] },
        { n: "Roquefort", p: 14_000, d: "Muzzarella y queso roquefort.", g: ["tamano", "adicionales"] },
        { n: "Provolone", p: 14_000, d: "Muzzarella, provolone y orégano.", g: ["tamano", "adicionales"] },
      ],
    },
    {
      nombre: "Pizzas especiales",
      productos: [
        { n: "Cuatro quesos", p: 15_500, d: "Muzzarella, roquefort, provolone y parmesano.", g: ["tamano"], t: ["más pedida"] },
        { n: "Rúcula y crudo", p: 16_500, d: "Muzzarella, jamón crudo, rúcula y parmesano.", g: ["tamano"], agotado: true },
        { n: "Palmitos", p: 16_000, d: "Muzzarella, jamón, palmitos y salsa golf.", g: ["tamano"] },
        { n: "Pollo barbacoa", p: 16_500, d: "Pollo desmenuzado, cebolla morada y salsa barbacoa.", g: ["tamano"], t: ["nueva"] },
        { n: "Vegana", p: 14_500, d: "Queso vegetal, vegetales grillados y pesto.", g: ["tamano"], t: ["vegana"] },
      ],
    },
    {
      nombre: "Media y media",
      productos: [{ n: "Pizza mitad y mitad", p: 13_000, d: "Elegí dos gustos de la carta. Los especiales suman un adicional.", g: ["tamano", "gustos"] }],
    },
    {
      nombre: "Empanadas",
      productos: [
        { n: "Empanada de carne cortada a cuchillo", p: 1_800, d: "Por unidad.", g: ["coccion"], t: ["más pedida"] },
        { n: "Empanada de pollo", p: 1_700, d: "Por unidad.", g: ["coccion"] },
        { n: "Empanada de jamón y queso", p: 1_700, d: "Por unidad.", g: ["coccion"] },
        { n: "Empanada de humita", p: 1_700, d: "Por unidad.", g: ["coccion"] },
        { n: "Empanada caprese", p: 1_800, d: "Por unidad.", g: ["coccion"] },
        { n: "Empanada de verdura", p: 1_700, d: "Por unidad. Vuelve en otoño.", g: ["coccion"], oculto: true },
      ],
    },
    {
      nombre: "Para acompañar y postres",
      productos: [
        { n: "Fainá", p: 3_000, d: "Porción grande." },
        { n: "Flan casero con dulce de leche", p: 4_500 },
        { n: "Tiramisú", p: 5_500 },
      ],
    },
    {
      nombre: "Bebidas",
      bebida: true,
      productos: [
        { n: "Gaseosa 1,5 L", p: 4_000 },
        { n: "Gaseosa 500 ml", p: 2_200 },
        { n: "Agua sin gas 500 ml", p: 1_800 },
        { n: "Cerveza rubia 1 L", p: 6_000 },
        { n: "Cerveza negra 1 L", p: 6_500 },
        { n: "Vino tinto de la casa (botella)", p: 9_000 },
      ],
    },
  ],
  demanda: [3, 0, 1, 1, 2, 4, 5],
  minutosEstimados: [30, 50],
};

// ─── Restaurante ─────────────────────────────────────────────────────────────

const RESTO: Demo = {
  slug: "demo-resto",
  name: "Restó Los Arrayanes (demo)",
  address: "25 de Mayo 455, San Miguel de Tucumán",
  whatsappE164: "+5493815550102",
  primaryColor: "#166534",
  menuStyle: "MANTEL",
  deliveryEnabled: true,
  deliveryFeeCents: pesos(2_500),
  minOrderCents: pesos(10_000),
  acceptTransfer: true,
  transferAlias: "arrayanes.resto.demo",
  transferHolder: "Los Arrayanes (demo)",
  showDescriptions: true,
  pendingAlertMinutes: 10,
  // Mediodía de lunes a sábado y domingo hasta las 16:00; noche de martes a sábado.
  horarios: [
    [0, "12:00", "16:00"],
    [1, "12:00", "15:30"],
    ...[2, 3, 4, 5, 6].flatMap((d): Franja[] => [
      [d, "12:00", "15:30"],
      [d, "20:00", "00:00"],
    ]),
  ],
  grupos: {
    guarnicion: {
      name: "Guarnición",
      min: 1,
      max: 1,
      opciones: [["Papas fritas"], ["Puré de papas"], ["Ensalada mixta"], ["Papas españolas", 1_500], ["Vegetales grillados", 2_000, true]],
    },
    punto: { name: "Punto de la carne", min: 1, max: 1, opciones: [["Jugoso"], ["A punto"], ["Bien cocido"]] },
    salsa: {
      name: "Salsa",
      min: 1,
      max: 1,
      opciones: [["Fileto"], ["Bolognesa", 2_000], ["Crema", 1_500], ["Cuatro quesos", 2_500], ["Pesto", 2_000]],
    },
    extrasMila: { name: "Extras", min: 0, max: 2, opciones: [["Huevo frito", 1_200], ["Papas extra", 3_000]] },
    sin: { name: "Sin ingredientes", kind: "REMOVE", min: 0, max: 4, opciones: [["Sin sal"], ["Sin cebolla"], ["Sin ajo"], ["Sin picante"]] },
  },
  categorias: [
    {
      nombre: "Entradas",
      productos: [
        { n: "Provoleta a la parrilla", p: 7_500, d: "Con orégano y aceite de oliva." },
        { n: "Rabas", p: 12_000, d: "Con limón y salsa alioli." },
        { n: "Ensalada César", p: 9_500, d: "Lechuga, pollo grillado, croutons y parmesano.", g: ["sin"] },
        { n: "Tabla de fiambres y quesos", p: 14_000, d: "Para 2 personas.", t: ["para compartir"] },
      ],
    },
    {
      nombre: "Parrilla",
      productos: [
        { n: "Bife de chorizo", p: 18_500, d: "350 g.", g: ["punto", "guarnicion", "sin"], t: ["más pedido"] },
        { n: "Vacío", p: 17_000, d: "350 g.", g: ["punto", "guarnicion", "sin"] },
        { n: "Pollo grillé", p: 13_500, d: "Pechuga deshuesada.", g: ["guarnicion", "sin"] },
        { n: "Milanesa napolitana", p: 14_500, d: "De ternera, con jamón, queso y salsa.", g: ["guarnicion", "extrasMila"], t: ["más pedido"] },
      ],
    },
    {
      nombre: "Pastas caseras",
      productos: [
        { n: "Ñoquis de papa", p: 9_500, g: ["salsa"] },
        { n: "Sorrentinos de jamón y queso", p: 11_500, g: ["salsa"] },
        { n: "Tallarines al huevo", p: 9_000, g: ["salsa"] },
        { n: "Lasaña de carne", p: 12_500, d: "Con salsa bolognesa y bechamel." },
      ],
    },
    {
      nombre: "Pescados",
      productos: [
        { n: "Merluza a la romana", p: 12_000, g: ["guarnicion"] },
        { n: "Salmón grillado", p: 21_000, d: "Con manteca de limón.", g: ["guarnicion"], agotado: true },
      ],
    },
    {
      nombre: "Cocina regional y veggie",
      productos: [
        { n: "Locro", p: 9_500, d: "Con quirquincho de cebolla de verdeo.", g: ["sin"], t: ["de temporada"] },
        { n: "Humita en chala", p: 6_500, d: "Dos unidades." },
        { n: "Risotto de hongos", p: 13_000, d: "Con hongos de pino y parmesano.", t: ["vegetariano"] },
        { n: "Menú ejecutivo", p: 11_000, d: "Plato del día, bebida y postre. Solo al mediodía.", oculto: true },
      ],
    },
    {
      nombre: "Postres",
      productos: [
        { n: "Flan mixto", p: 4_800, d: "Con dulce de leche y crema." },
        { n: "Panqueques con dulce de leche", p: 5_200 },
        { n: "Helado (2 bochas)", p: 4_500 },
      ],
    },
    {
      nombre: "Bebidas",
      bebida: true,
      productos: [
        { n: "Agua con o sin gas", p: 2_500 },
        { n: "Gaseosa 500 ml", p: 3_000 },
        { n: "Limonada con menta y jengibre", p: 4_500, t: ["casera"] },
        { n: "Cerveza artesanal (pinta)", p: 5_500 },
        { n: "Copa de vino", p: 4_000 },
        { n: "Malbec reserva (botella)", p: 15_000 },
        { n: "Café", p: 2_500 },
      ],
    },
  ],
  demanda: [5, 2, 2, 3, 3, 4, 5],
  minutosEstimados: [25, 45],
};

// ─── Cafetería, panadería y pastelería ───────────────────────────────────────

const CAFE: Demo = {
  slug: "demo-cafe",
  name: "Café Alma (demo)",
  address: "Laprida 310, San Miguel de Tucumán",
  whatsappE164: "+5493815550103",
  primaryColor: "#facc15",
  menuStyle: "MOSTRADOR",
  deliveryEnabled: true,
  deliveryFeeCents: 0,
  minOrderCents: pesos(12_000),
  acceptTransfer: true,
  transferAlias: "cafealma.demo",
  transferHolder: "Café Alma (demo)",
  showDescriptions: false,
  pendingAlertMinutes: 15,
  // Corrido de lunes a sábado; domingo solo a la mañana.
  horarios: [[0, "08:30", "13:00"], ...[1, 2, 3, 4, 5, 6].map((d): Franja => [d, "07:30", "20:30"])],
  grupos: {
    tamanoCafe: { name: "Tamaño", min: 1, max: 1, opciones: [["Chico"], ["Mediano", 800], ["Grande", 1_500]] },
    leche: { name: "Leche", min: 1, max: 1, opciones: [["Entera"], ["Descremada"], ["Almendras", 900], ["Avena", 900]] },
    extrasCafe: { name: "Extras", min: 0, max: 2, opciones: [["Shot extra de café", 1_000], ["Crema", 700], ["Sabor vainilla", 600]] },
    medialunas: { name: "Medialunas", min: 1, max: 1, opciones: [["De manteca"], ["De grasa"]] },
    facturas: {
      name: "Elegí hasta 3 variedades",
      min: 1,
      max: 3,
      opciones: [["Medialunas"], ["Vigilantes"], ["Cañoncitos de dulce de leche"], ["Bolas de fraile"], ["Tortitas negras"], ["Sacramentos", 0, true]],
    },
    torta: { name: "Presentación", min: 1, max: 1, opciones: [["Porción"], ["Torta entera (10 porciones)", 32_000]] },
    sinTostado: { name: "Sin ingredientes", kind: "REMOVE", min: 0, max: 2, opciones: [["Sin tomate"], ["Sin manteca"]] },
  },
  categorias: [
    {
      nombre: "Desayunos y meriendas",
      productos: [
        { n: "Desayuno Alma", p: 7_500, d: "Café con leche, 2 medialunas y jugo de naranja.", g: ["tamanoCafe", "leche"], t: ["más pedido"] },
        { n: "Merienda dulce", p: 8_500, d: "Infusión, porción de torta y cookies.", g: ["tamanoCafe"] },
      ],
    },
    {
      nombre: "Panadería",
      productos: [
        { n: "Docena de medialunas", p: 7_200, g: ["medialunas"], t: ["más pedido"] },
        { n: "Media docena de medialunas", p: 3_800, g: ["medialunas"] },
        { n: "Docena de facturas surtidas", p: 7_500, g: ["facturas"] },
        { n: "Pan de campo", p: 3_000, d: "Masa madre, 600 g." },
        { n: "Pan de molde integral", p: 3_500, t: ["integral"] },
        { n: "Chipá (bolsa de 12)", p: 4_500, t: ["sin TACC"] },
        { n: "Bizcochitos de grasa (250 g)", p: 2_500 },
      ],
    },
    {
      nombre: "Pastelería",
      productos: [
        { n: "Torta de chocolate", p: 4_500, g: ["torta"] },
        { n: "Cheesecake de frutos rojos", p: 5_000, g: ["torta"], t: ["más pedido"] },
        { n: "Lemon pie", p: 4_500, g: ["torta"], agotado: true },
        { n: "Tarta de manzana", p: 4_800, g: ["torta"], t: ["vegano"] },
        { n: "Alfajor de maicena", p: 1_500, t: ["sin TACC"] },
        { n: "Brownie con nueces", p: 2_800 },
        { n: "Budín de limón", p: 6_000 },
        { n: "Cookies (3 unidades)", p: 2_500 },
        { n: "Rosca de Pascua", p: 12_000, oculto: true },
      ],
    },
    {
      nombre: "Salado",
      productos: [
        { n: "Tostado de jamón y queso", p: 5_500, g: ["sinTostado"] },
        { n: "Medialuna rellena de jamón y queso", p: 2_800 },
        { n: "Tostada con palta", p: 6_500, t: ["vegano"] },
        { n: "Sándwiches de miga (6 unidades)", p: 6_000 },
      ],
    },
    {
      nombre: "Cafetería",
      bebida: true,
      productos: [
        { n: "Espresso", p: 2_200, g: ["extrasCafe"] },
        { n: "Cortado", p: 2_500, g: ["tamanoCafe", "leche", "extrasCafe"] },
        { n: "Café con leche", p: 2_800, g: ["tamanoCafe", "leche", "extrasCafe"] },
        { n: "Capuchino", p: 3_500, g: ["tamanoCafe", "leche", "extrasCafe"] },
        { n: "Submarino", p: 3_800, g: ["leche"] },
        { n: "Té en hebras", p: 2_000 },
      ],
    },
    {
      nombre: "Bebidas frías",
      bebida: true,
      productos: [
        { n: "Jugo de naranja exprimido", p: 3_500 },
        { n: "Licuado de banana", p: 4_200, g: ["leche"] },
        { n: "Limonada", p: 3_500 },
        { n: "Agua sin gas 500 ml", p: 1_800 },
      ],
    },
  ],
  demanda: [2, 3, 3, 3, 3, 4, 5],
  minutosEstimados: [10, 25],
};

const DEMOS = [PIZZERIA, RESTO, CAFE];

// ─── Creación ────────────────────────────────────────────────────────────────

const ROLES = [
  { role: "OWNER", usuario: "dueno", name: "Dueño" },
  { role: "MANAGER", usuario: "encargado", name: "Encargada" },
  { role: "STAFF", usuario: "personal", name: "Personal" },
] as const;

async function borrarDemos() {
  const negocios = await db.business.findMany({ where: { slug: { in: DEMOS.map((d) => d.slug) } }, select: { id: true } });
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
  console.log(`Borrados ${ids.length} negocios demo.`);
}

type ProductoCreado = { id: string; bebida: boolean; precio: number; grupos: { min: number; max: number; opciones: string[] }[] };

async function crearDemo(demo: Demo, passwordHash: string) {
  const creado = await db.business.create({
    data: {
      slug: demo.slug,
      name: demo.name,
      address: demo.address,
      whatsappE164: demo.whatsappE164,
      primaryColor: demo.primaryColor,
      menuStyle: demo.menuStyle,
      deliveryEnabled: demo.deliveryEnabled,
      deliveryFeeCents: demo.deliveryFeeCents,
      minOrderCents: demo.minOrderCents,
      acceptCash: true,
      acceptTransfer: demo.acceptTransfer,
      transferAlias: demo.transferAlias,
      transferHolder: demo.transferHolder,
      showPhotos: true,
      showDescriptions: demo.showDescriptions,
      pendingAlertMinutes: demo.pendingAlertMinutes,
      openingHours: { create: demo.horarios.map(([weekday, abre, cierra]) => ({ weekday, opensMin: minutos(abre), closesMin: minutos(cierra) })) },
    },
  });
  const businessId = negocioResuelto(creado.id);

  const usuarios = [];
  for (const { role, usuario, name } of ROLES) {
    usuarios.push(await db.appUser.create({ data: { businessId, email: `${usuario}@${demo.slug}.test`, name: `${name} ${demo.name.replace(" (demo)", "")}`, role, passwordHash } }));
  }

  // Grupos de opciones: se guardan los IDs de las opciones disponibles para armar pedidos.
  const grupos: Record<string, { id: string; min: number; max: number; disponibles: string[] }> = {};
  for (const [clave, g] of Object.entries(demo.grupos)) {
    const grupo = await db.optionGroup.create({
      data: {
        businessId,
        name: g.name,
        kind: g.kind ?? "CHOICE",
        minSelect: g.min,
        maxSelect: g.max,
        options: { create: g.opciones.map(([name, adicional = 0, noDisponible = false], position) => ({ name, priceDeltaCents: pesos(adicional), isAvailable: !noDisponible, position })) },
      },
      include: { options: { orderBy: { position: "asc" } } },
    });
    grupos[clave] = { id: grupo.id, min: g.min, max: g.max, disponibles: grupo.options.filter((o) => o.isAvailable).map((o) => o.id) };
  }

  const pedibles: ProductoCreado[] = [];
  let cantidad = 0;
  for (const [posicionCategoria, c] of demo.categorias.entries()) {
    const categoria = await db.category.create({ data: { businessId, name: c.nombre, position: posicionCategoria } });
    for (const [position, p] of c.productos.entries()) {
      const claves = p.g ?? [];
      const producto = await db.product.create({
        data: {
          businessId,
          categoryId: categoria.id,
          name: p.n,
          description: p.d ?? null,
          priceCents: pesos(p.p),
          position,
          tags: p.t ?? [],
          isSoldOut: p.agotado ?? false,
          isActive: !p.oculto,
          optionGroups: { create: claves.map((clave, i) => ({ groupId: grupos[clave].id, position: i })) },
        },
      });
      cantidad++;
      if (!p.agotado && !p.oculto) {
        pedibles.push({ id: producto.id, bebida: !!c.bebida, precio: p.p, grupos: claves.map((clave) => ({ min: grupos[clave].min, max: grupos[clave].max, opciones: grupos[clave].disponibles })) });
      }
    }
  }

  const pedidos = await crearPedidos(demo, businessId, creado.timezone, pedibles, usuarios[2].id);
  console.log(`${demo.slug}: ${demo.categorias.length} categorías, ${cantidad} productos, ${Object.keys(grupos).length} grupos, ${pedidos} pedidos.`);
}

// ─── Pedidos ─────────────────────────────────────────────────────────────────

const NOMBRES = ["Ana Pérez", "Juan Gómez", "María López", "Carlos Díaz", "Lucía Romero", "Martín Sosa", "Sofía Herrera", "Diego Medina", "Valentina Ruiz", "Facundo Castro", "Camila Juárez", "Nicolás Paz"];
const BARRIOS = ["Centro", "Barrio Norte", "Barrio Sur", "Villa Luján", "Yerba Buena", "Ciudadela"];
const CALLES = ["Mendoza", "San Martín", "Muñecas", "Laprida", "Crisóstomo Álvarez", "Junín", "Lamadrid"];
const MOTIVOS = ["OUT_OF_STOCK", "OUT_OF_ZONE", "CUSTOMER_REQUEST", "CLOSED", "DUPLICATE"] as const;
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const azar = (n: number) => randomInt(n);
const elegir = <T,>(lista: readonly T[]) => lista[azar(lista.length)];

/** Opciones válidas para un producto: entre el mínimo y el máximo de cada grupo, sin repetir. */
function opcionesPara(p: ProductoCreado): string[] {
  return p.grupos.flatMap((g) => {
    const tope = Math.min(g.max, g.opciones.length);
    const cuantas = g.min > 0 ? g.min + azar(tope - g.min + 1) : azar(10) < 6 ? 0 : 1 + azar(tope);
    return [...g.opciones].sort(() => Math.random() - 0.5).slice(0, cuantas);
  });
}

function itemAlAzar(platos: ProductoCreado[], bebidas: ProductoCreado[], bebida = false) {
  const p = bebida && bebidas.length ? elegir(bebidas) : elegir(platos);
  // Las empanadas y las cosas baratas se piden de a varias; las bebidas, de a una o dos.
  const quantity = bebida ? 1 + azar(2) : p.precio <= 2_000 ? 6 + azar(7) : 1 + (azar(10) < 3 ? 1 : 0);
  return { productId: p.id, quantity, optionIds: opcionesPara(p), note: azar(10) === 0 ? "Bien caliente, por favor" : null };
}

function caminoHasta(final: EstadoPedido, fulfillment: "PICKUP" | "DELIVERY"): EstadoPedido[] {
  if (final === "CANCELLED") return azar(3) === 0 ? ["PENDING", "CONFIRMED", "CANCELLED"] : ["PENDING", "CANCELLED"];
  const camino: EstadoPedido[] =
    fulfillment === "DELIVERY" ? ["PENDING", "CONFIRMED", "PREPARING", "READY", "ON_THE_WAY", "DELIVERED"] : ["PENDING", "CONFIRMED", "PREPARING", "READY", "DELIVERED"];
  return camino.slice(0, camino.indexOf(final) + 1);
}

/** Un momento al azar dentro del horario del día `fecha` (AAAA-MM-DD), o null si ese día no abre. */
function momentoEnHorario(demo: Demo, fecha: string): Date | null {
  const dia = new Date(`${fecha}T12:00:00-03:00`).getUTCDay();
  const franjas = demo.horarios.filter(([weekday]) => weekday === dia);
  if (!franjas.length) return null;
  const [, abre, cierra] = elegir(franjas);
  const desde = minutos(abre);
  const hasta = minutos(cierra) <= desde ? minutos(cierra) + 1440 : minutos(cierra);
  // Más pedidos en la primera mitad de la franja (la hora pico).
  const minuto = desde + Math.floor((hasta - desde - 10) * Math.random() ** 1.5);
  return new Date(new Date(`${fecha}T00:00:00-03:00`).getTime() + minuto * 60_000);
}

async function crearPedidos(demo: Demo, businessId: NegocioId, timezone: string, pedibles: ProductoCreado[], usuarioId: string) {
  const config = {
    deliveryEnabled: demo.deliveryEnabled,
    deliveryFeeCents: demo.deliveryFeeCents,
    minOrderCents: demo.minOrderCents,
    acceptCash: true,
    acceptTransfer: demo.acceptTransfer,
  };
  const productosMenu = await cargarProductosParaPedido(db, businessId, pedibles.map((p) => p.id));
  const platos = pedibles.filter((p) => !p.bebida);
  const bebidas = pedibles.filter((p) => p.bebida);
  const codigos = new Map<string, Set<string>>();
  const ahora = Date.now();

  // Historial: 55 pedidos terminados en los últimos 30 días, repartidos según la demanda de cada día.
  const plan: { creado: Date; final: EstadoPedido }[] = [];
  while (plan.length < 55) {
    const fecha = fechaDeNegocio(new Date(ahora - (1 + azar(30)) * 86_400_000), timezone);
    const dia = new Date(`${fecha}T12:00:00-03:00`).getUTCDay();
    if (azar(5) >= demo.demanda[dia]) continue;
    const creado = momentoEnHorario(demo, fecha);
    if (creado) plan.push({ creado, final: azar(100) < 88 ? "DELIVERED" : "CANCELLED" });
  }
  // Hoy: algunos terminados y uno por cada columna del panel.
  const hace = (min: number) => new Date(ahora - min * 60_000);
  plan.push(
    { creado: hace(150), final: "DELIVERED" },
    { creado: hace(120), final: "DELIVERED" },
    { creado: hace(95), final: "CANCELLED" },
    { creado: hace(60), final: "READY" },
    { creado: hace(45), final: "PREPARING" },
    { creado: hace(30), final: "CONFIRMED" },
    { creado: hace(8), final: "PENDING" },
    { creado: hace(3), final: "PENDING" },
  );
  if (demo.deliveryEnabled) plan.push({ creado: hace(70), final: "ON_THE_WAY" });

  let total = 0;
  for (const { creado, final } of plan.sort((a, b) => a.creado.getTime() - b.creado.getTime())) {
    const fulfillment = final === "ON_THE_WAY" || (demo.deliveryEnabled && azar(10) < 5) ? "DELIVERY" : "PICKUP";
    const paymentMethod = demo.acceptTransfer && azar(100) < 35 ? "TRANSFER" : "CASH";
    const items: CarritoPedido["items"] = [itemAlAzar(platos, bebidas)];
    if (azar(10) < 4) items.push(itemAlAzar(platos, bebidas));
    if (azar(10) < 6) items.push(itemAlAzar(platos, bebidas, true));

    // Se agregan productos hasta llegar al mínimo del local.
    let calculo = calcularPedido({ fulfillment, paymentMethod, items }, productosMenu, config);
    for (let intento = 0; !calculo.ok && calculo.code === "MIN_ORDER_NOT_REACHED" && intento < 6; intento++) {
      items.push(itemAlAzar(platos, bebidas));
      calculo = calcularPedido({ fulfillment, paymentMethod, items }, productosMenu, config);
    }
    if (!calculo.ok) throw new Error(`${demo.slug}: carrito inválido (${calculo.code}) ${JSON.stringify(calculo)}`);

    const fecha = fechaDeNegocio(creado, timezone);
    const usados = codigos.get(fecha) ?? new Set<string>();
    codigos.set(fecha, usados);
    let codigo = "";
    do codigo = Array.from({ length: 4 }, () => elegir([...ALFABETO])).join("");
    while (usados.has(codigo));
    usados.add(codigo);

    const camino = caminoHasta(final, fulfillment);
    const estimados = demo.minutosEstimados[0] + 5 * azar((demo.minutosEstimados[1] - demo.minutosEstimados[0]) / 5 + 1);
    const nombre = elegir(NOMBRES);
    await db.$transaction(async (tx) => {
      const pedido = await insertarPedido(tx, businessId, {
        businessDate: new Date(`${fecha}T00:00:00Z`),
        publicCode: codigo,
        publicToken: generarTokenPublico(),
        clientRequestId: randomUUID(),
        status: "PENDING",
        fulfillment,
        customerName: nombre,
        customerPhone: `+549381555${String(1000 + azar(9000))}`,
        address:
          fulfillment === "DELIVERY"
            ? { street: elegir(CALLES), number: String(100 + azar(2400)), neighborhood: elegir(BARRIOS), unit: azar(4) === 0 ? `${1 + azar(8)}${elegir(["A", "B", "C"])}` : null, reference: azar(5) === 0 ? "Portón negro" : null }
            : undefined,
        note: azar(8) === 0 ? "Tocar timbre" : null,
        paymentMethod,
        cashChangeForCents: paymentMethod === "CASH" && azar(3) === 0 ? Math.ceil(calculo.totalCents / 1_000_000) * 1_000_000 : null,
        lines: calculo.lines,
        subtotalCents: calculo.subtotalCents,
        deliveryFeeCents: calculo.deliveryFeeCents,
        totalCents: calculo.totalCents,
        createdAt: creado,
      });

      // Pasos con tiempos realistas: confirmar en 2-6 min, preparar según el local, salir y entregar.
      const preparacion = estimados - 5 + azar(15);
      const demora: Partial<Record<EstadoPedido, number>> = { CONFIRMED: 2 + azar(5), PREPARING: 1 + azar(3), READY: preparacion, ON_THE_WAY: 2 + azar(5), DELIVERED: 5 + azar(20), CANCELLED: 3 + azar(8) };
      let momento = creado.getTime();
      for (let paso = 1; paso < camino.length; paso++) {
        const to = camino[paso];
        momento = Math.min(momento + (demora[to] ?? 5) * 60_000, ahora - (camino.length - paso) * 60_000);
        const cuando = new Date(momento);
        const motivo = to === "CANCELLED" ? elegir(MOTIVOS) : null;
        const cobrado = to === "DELIVERED" && azar(10) < 9;
        await tx.order.update({
          where: { id: pedido.id },
          data: {
            status: to,
            ...(to === "CONFIRMED" && { confirmedAt: cuando, estimatedMinutes: estimados }),
            ...(to === "READY" && { readyAt: cuando }),
            ...(to === "DELIVERED" && { deliveredAt: cuando }),
            ...(cobrado && { paidAt: cuando, paidBy: usuarioId }),
            ...(to === "CANCELLED" && { cancelledAt: cuando, cancelReason: motivo }),
          },
        });
        await tx.orderStatusHistory.create({
          data: { businessId, orderId: pedido.id, fromStatus: camino[paso - 1], toStatus: to, userId: usuarioId, reason: motivo, createdAt: cuando },
        });
      }
    });
    total++;
  }
  return total;
}

async function main() {
  const contrasena = process.env.DEMO_PASSWORD ?? "";
  const problema = problemaConContrasena(contrasena);
  if (problema) throw new Error(`DEMO_PASSWORD: ${problema} Configurala en el .env que corresponda.`);

  if (process.argv.includes("--reset")) await borrarDemos();
  const passwordHash = await hashearContrasena(contrasena);
  for (const demo of DEMOS) {
    if (await db.business.findUnique({ where: { slug: demo.slug } })) {
      console.log(`${demo.slug} ya existe: no se modifica (usá --reset para recrearlo).`);
      continue;
    }
    await crearDemo(demo, passwordHash);
  }
  console.log("Usuarios: dueno|encargado|personal@<slug>.test con la contraseña de DEMO_PASSWORD.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
