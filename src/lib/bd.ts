import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma sobre node-postgres. Con Neon, DATABASE_URL es la conexión con pooler (host con -pooler);
 * las migraciones usan la directa (prisma.config.ts).
 */
function createClient() {
  // DATABASE_POOL_MAX: en local con `prisma dev` (PGlite) conviene 1, porque corta conexiones simultáneas.
  const max = Number(process.env.DATABASE_POOL_MAX) || undefined;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max });
  // En Vercel (Fluid compute) cierra las conexiones ociosas antes de que la instancia se suspenda.
  // Fuera de Vercel no hace nada.
  attachDatabasePool(pool);
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

// En desarrollo, el hot reload re-evalúa los módulos: se reutiliza una sola instancia.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Db = typeof db;
/** Cliente dentro de una transacción interactiva. */
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
