/**
 * Carga el negocio piloto Hawken's Food (local ficticio con el nombre de la marca Hawken) con su menú
 * real. Sirve para la base local y para producción: crea el negocio una sola vez y, si ya existe, no
 * toca nada (los cambios posteriores se hacen desde el panel).
 *
 * El usuario dueño se crea solo si están PILOTO_OWNER_EMAIL y PILOTO_OWNER_PASSWORD en el entorno.
 * Fotos: todavía no hay; se cargan desde el panel (Fase 6a) con imágenes genéricas.
 *
 *   npm run db:piloto
 */
import "dotenv/config";
import { db } from "@/lib/bd";
import { hashearContrasena, normalizarEmail, problemaConContrasena } from "@/modulos/autenticacion";

const SLUG = "hawkens-food";
const pesos = (n: number) => n * 100;

// Mismo recargo para milanesa, asadito y hamburguesa tradicional.
const TIPO = [
  { name: "Común", priceDeltaCents: 0 },
  { name: "Común con papas", priceDeltaCents: pesos(1_000) },
  { name: "Especial", priceDeltaCents: pesos(3_000) },
];
// Nueva línea: doble y triple suman lo mismo en las cinco hamburguesas.
const TAMANO = [
  { name: "Simple", priceDeltaCents: 0 },
  { name: "Doble", priceDeltaCents: pesos(1_500) },
  { name: "Triple", priceDeltaCents: pesos(2_500) },
];
const INCLUYE = "Incluye queso cheddar y papas fritas.";

async function main() {
  const existente = await db.business.findUnique({ where: { slug: SLUG } });
  if (existente) {
    console.log(`El negocio ${SLUG} ya existe: no se modifica.`);
    await crearDueno(existente.id);
    return;
  }

  const negocio = await db.business.create({
    data: {
      slug: SLUG,
      name: "Hawken's Food",
      deliveryEnabled: true,
      deliveryFeeCents: pesos(1_500),
      minOrderCents: 0,
      acceptCash: true,
      // Se activa cuando se cargue el alias desde el panel.
      acceptTransfer: false,
      showPhotos: true,
      // Horario provisorio: todos los días de 19:00 a 00:00 (se ajusta desde el panel).
      openingHours: { create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensMin: 19 * 60, closesMin: 0 })) },
    },
  });
  const businessId = negocio.id;

  const grupo = (name: string, minSelect: number, maxSelect: number, options: { name: string; priceDeltaCents: number }[]) =>
    db.optionGroup.create({
      data: {
        businessId,
        name,
        kind: "CHOICE",
        minSelect,
        maxSelect,
        options: { create: options.map((o, position) => ({ ...o, position })) },
      },
    });
  const tipo = await grupo("Tipo", 1, 1, TIPO);
  const tamano = await grupo("Tamaño", 1, 1, TAMANO);
  const cheddar = await grupo("Agregados", 0, 1, [{ name: "Cheddar", priceDeltaCents: pesos(1_000) }]);
  const medallon = await grupo("Agregados de hamburguesa", 0, 1, [{ name: "Medallón extra", priceDeltaCents: pesos(2_500) }]);

  const categoria = (name: string, position: number) => db.category.create({ data: { businessId, name, position } });
  const nuevaLinea = await categoria("Nueva línea de hamburguesas", 0);
  const hamburguesas = await categoria("Hamburguesas", 1);
  const sandwiches = await categoria("Sándwiches", 2);

  const productos: {
    categoryId: string;
    name: string;
    precio: number;
    description: string | null;
    groups: string[];
    tags?: string[];
  }[] = [
    { categoryId: nuevaLinea.id, name: "Cheesse", precio: 8_500, description: `Mostaza, ketchup y cebolla brunoise. ${INCLUYE}`, groups: [tamano.id], tags: ["nuevo"] },
    { categoryId: nuevaLinea.id, name: "Beacon Staker", precio: 9_500, description: `Salsa Staker y beacon. ${INCLUYE}`, groups: [tamano.id], tags: ["nuevo"] },
    { categoryId: nuevaLinea.id, name: "Americana", precio: 9_000, description: `Barbacoa, huevo y beacon. ${INCLUYE}`, groups: [tamano.id], tags: ["nuevo"] },
    { categoryId: nuevaLinea.id, name: "Barbacoa", precio: 9_000, description: `Barbacoa, cebolla caramelizada y beacon. ${INCLUYE}`, groups: [tamano.id], tags: ["nuevo"] },
    { categoryId: nuevaLinea.id, name: "Royal", precio: 9_500, description: `Beacon, aros de cebolla y salsa tasty. ${INCLUYE}`, groups: [tamano.id], tags: ["nuevo"] },
    { categoryId: hamburguesas.id, name: "Hamburguesa tradicional", precio: 9_000, description: "Nuestras hamburguesas de siempre.", groups: [tipo.id, medallon.id] },
    { categoryId: hamburguesas.id, name: "Hamburguesa Billy", precio: 12_000, description: "Salsa especial, cheddar, panceta y cebolla caramelizada.", groups: [] },
    { categoryId: sandwiches.id, name: "Sándwich de milanesa", precio: 9_000, description: null, groups: [tipo.id, cheddar.id] },
    { categoryId: sandwiches.id, name: "Asadito árabe", precio: 9_000, description: null, groups: [tipo.id] },
    { categoryId: sandwiches.id, name: "Napolitana", precio: 12_000, description: null, groups: [] },
  ];

  for (const [position, p] of productos.entries()) {
    await db.product.create({
      data: {
        businessId,
        categoryId: p.categoryId,
        name: p.name,
        description: p.description,
        priceCents: pesos(p.precio),
        position,
        tags: p.tags ?? [],
        optionGroups: { create: p.groups.map((groupId, i) => ({ groupId, position: i })) },
      },
    });
  }
  console.log(`Negocio ${SLUG} creado: 3 categorías, ${productos.length} productos, 4 grupos de opciones.`);
  await crearDueno(businessId);
}

async function crearDueno(businessId: string) {
  const email = process.env.PILOTO_OWNER_EMAIL;
  const contrasena = process.env.PILOTO_OWNER_PASSWORD;
  if (!email || !contrasena) {
    console.log("Sin PILOTO_OWNER_EMAIL / PILOTO_OWNER_PASSWORD: no se crea el usuario dueño.");
    return;
  }
  const problema = problemaConContrasena(contrasena);
  if (problema) throw new Error(`PILOTO_OWNER_PASSWORD: ${problema}`);
  const normalizado = normalizarEmail(email);
  if (await db.appUser.findUnique({ where: { email: normalizado } })) {
    console.log(`El usuario ${normalizado} ya existe: no se modifica.`);
    return;
  }
  await db.appUser.create({
    data: { businessId, email: normalizado, name: "Dueño Hawken's Food", role: "OWNER", passwordHash: await hashearContrasena(contrasena) },
  });
  console.log(`Usuario dueño creado: ${normalizado}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
