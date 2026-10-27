import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

/** Métricas (Fase 7) sobre la-esquina del seed: los totales coinciden con la base y el personal no entra. */

const CLAVE = process.env.SEED_PASSWORD ?? "";
test.skip(!CLAVE, "Falta SEED_PASSWORD en .env");

async function sql<T = unknown>(consulta: string, valores: unknown[] = []): Promise<T[]> {
  const cliente = new Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  try {
    return (await cliente.query(consulta, valores)).rows as T[];
  } finally {
    await cliente.end();
  }
}

test.beforeEach(async () => {
  await sql("DELETE FROM rate_limit_hit WHERE key LIKE 'login-%'");
});

async function ingresar(page: Page, rol: "manager" | "staff") {
  await page.goto("/admin/ingresar");
  await page.getByLabel("Email").fill(`${rol}@la-esquina.test`);
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/admin\/menu$/);
}

test("el encargado ve las métricas del mes y coinciden con la base", async ({ page }) => {
  await ingresar(page, "manager");
  await page.getByRole("link", { name: "Métricas" }).first().click();
  await expect(page.getByRole("heading", { name: "Métricas" })).toBeVisible();
  await Promise.all([page.waitForResponse((r) => r.url().includes("/api/v1/admin/metrics") && r.ok()), page.getByRole("button", { name: "Este mes" }).click()]);
  await expect(page.getByRole("button", { name: "Este mes" })).toHaveAttribute("aria-pressed", "true");

  const [{ recibidos, entregados }] = await sql<{ recibidos: number; entregados: number }>(
    `SELECT COUNT(*)::int AS recibidos, COUNT(*) FILTER (WHERE status = 'DELIVERED')::int AS entregados
     FROM customer_order WHERE business_id = (SELECT id FROM business WHERE slug = 'la-esquina')
       AND business_date >= date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date
       AND business_date <= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`,
  );
  const tarjeta = (titulo: string) => page.locator("dl > div", { has: page.getByText(titulo, { exact: true }) }).locator("dd").first();
  await expect(tarjeta("Pedidos recibidos")).toHaveText(String(recibidos));
  await expect(tarjeta("Entregados")).toHaveText(String(entregados));
  await expect(page.getByText(/ganancia/i)).toHaveCount(0);
});

test("el personal no ve Métricas ni puede entrar", async ({ page }) => {
  await ingresar(page, "staff");
  await expect(page.getByRole("link", { name: "Métricas" })).toHaveCount(0);
  await page.goto("/admin/metricas");
  await expect(page).toHaveURL(/\/admin$/);
  expect((await page.request.get("/api/v1/admin/metrics?from=2026-10-01&to=2026-10-27")).status()).toBe(403);
});
