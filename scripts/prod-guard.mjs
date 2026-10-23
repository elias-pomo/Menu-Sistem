// Corre antes de cada `npm run db:prod:*`: confirma que el entorno es el de Neon y muestra el host.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";
let host = "";
try {
  host = new URL(url).host;
} catch {}
if (!host.endsWith(".neon.tech")) {
  console.error("No se encontró la base de Neon en .env.produccion (DATABASE_URL_UNPOOLED). Corré: neon env pull --file .env.produccion");
  process.exit(1);
}
console.log(`Base de Neon: ${host}`);
