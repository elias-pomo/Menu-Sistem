import { connection } from "next/server";
import { db } from "@/lib/bd";

/** Chequeo de disponibilidad: responde 200 si la app y la base contestan. */
export async function GET() {
  await connection();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
