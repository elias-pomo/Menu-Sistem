import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Configuración del CLI de Prisma (migraciones, seed, studio). La app usa DATABASE_URL desde src/lib/bd.ts.
 * Neon: DATABASE_URL = conexión con pooler (la app); DATABASE_URL_UNPOOLED = conexión directa (migraciones y
 * seed). Es el nombre que usa `neon env pull`; DIRECT_DATABASE_URL se acepta como alias.
 * Sin URL (`prisma generate` en el build de Vercel) no se declara datasource.
 */
const directa = process.env.DATABASE_URL_UNPOOLED ? "DATABASE_URL_UNPOOLED" : process.env.DIRECT_DATABASE_URL ? "DIRECT_DATABASE_URL" : null;
const databaseUrl = (directa && process.env[directa]) || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // react-server: `server-only` no falla fuera de Next.
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  ...(databaseUrl && {
    datasource: {
      url: env(directa ?? "DATABASE_URL"),
      ...(process.env.SHADOW_DATABASE_URL && { shadowDatabaseUrl: env("SHADOW_DATABASE_URL") }),
    },
  }),
});
