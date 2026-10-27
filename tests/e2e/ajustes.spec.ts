import "dotenv/config";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";

/**
 * Ajustes del panel (Fase 6b) sobre la-esquina del seed. Guarda la configuración al empezar y la
 * restaura al final; los usuarios que crea se borran.
 */

const CLAVE = process.env.SEED_PASSWORD ?? "";
test.skip(!CLAVE, "Falta SEED_PASSWORD en .env");
test.describe.configure({ mode: "serial" });

const ESQUINA = "(SELECT id FROM business WHERE slug = 'la-esquina')";
const DOMINIO = "@e2e-ajustes.test";
let original: Record<string, unknown> = {};

async function sql<T = unknown>(consulta: string, valores: unknown[] = []): Promise<T[]> {
  const cliente = new Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  try {
    return (await cliente.query(consulta, valores)).rows as T[];
  } finally {
    await cliente.end();
  }
}

async function limpiarUsuarios() {
  await sql(`DELETE FROM audit_log WHERE entity_id IN (SELECT id::text FROM app_user WHERE email LIKE $1)`, [`%${DOMINIO}`]);
  await sql(`DELETE FROM app_user WHERE email LIKE $1`, [`%${DOMINIO}`]);
}

test.beforeAll(async () => {
  [original] = await sql(`SELECT delivery_enabled, delivery_fee_cents, accepting_orders, pause_message FROM business WHERE id = ${ESQUINA}`);
  await sql("DELETE FROM rate_limit_hit WHERE key LIKE 'login-%'");
  await limpiarUsuarios();
});

test.afterAll(async () => {
  await sql(`UPDATE business SET delivery_enabled = $1, delivery_fee_cents = $2, accepting_orders = $3, pause_message = $4 WHERE id = ${ESQUINA}`, [
    original.delivery_enabled,
    original.delivery_fee_cents,
    original.accepting_orders,
    original.pause_message,
  ]);
  await limpiarUsuarios();
});

async function ingresar(page: Page, email: string, clave = CLAVE) {
  await page.goto("/admin/ingresar");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/admin\/menu$/);
}

async function nuevaPagina(browser: Browser) {
  return (await browser.newContext()).newPage();
}

test("el dueño cambia el costo de envío y el menú público lo muestra enseguida", async ({ page, request }) => {
  await ingresar(page, "owner@la-esquina.test");
  await page.getByRole("link", { name: "Ajustes" }).first().click();
  await expect(page.getByRole("heading", { name: "Envío y pagos" })).toBeVisible();
  const seccion = page.locator("form", { has: page.getByRole("heading", { name: "Envío y pagos" }) });
  await seccion.getByLabel("Hacer delivery").check();
  await seccion.getByLabel("Costo de envío").fill("1.234");
  await seccion.getByRole("button", { name: "Guardar" }).click();
  await expect(seccion.getByRole("status")).toHaveText(/Guardado/);

  const menu = await (await request.get("/api/v1/public/la-esquina/menu")).json();
  expect(menu.business.deliveryFeeCents).toBe(123_400);
});

test("el personal ve Ajustes en solo lectura, sin Usuarios ni Historial", async ({ browser }) => {
  const page = await nuevaPagina(browser);
  await ingresar(page, "staff@la-esquina.test");
  await page.goto("/admin/ajustes");
  await expect(page.getByRole("link", { name: "Mi contraseña" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Historial" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Guardar" })).toHaveCount(0);
  await expect(page.getByText("Lo puede cambiar solo el dueño.", { exact: false })).toBeVisible();
  await page.goto("/admin/ajustes/usuarios");
  await expect(page).toHaveURL(/\/admin\/ajustes$/);
  expect((await page.request.get("/api/v1/admin/users")).status()).toBe(403);
});

test("el personal pausa los pedidos desde el panel y el menú lo muestra", async ({ browser }) => {
  const page = await nuevaPagina(browser);
  await ingresar(page, "staff@la-esquina.test");
  await page.goto("/admin");
  await page.getByRole("button", { name: "Pausar pedidos" }).click();
  await page.getByLabel(/Mensaje para los clientes/).fill("Volvemos en un rato, gracias.");
  await page.getByRole("button", { name: "Pausar ahora" }).click();
  await expect(page.getByRole("button", { name: "Reanudar pedidos" })).toBeVisible();

  const cliente = await nuevaPagina(browser);
  await cliente.goto("/la-esquina");
  await expect(cliente.getByText("Volvemos en un rato, gracias.")).toBeVisible();

  await page.getByRole("button", { name: "Reanudar pedidos" }).click();
  await expect(page.getByRole("button", { name: "Pausar pedidos" })).toBeVisible();
  await cliente.reload();
  await expect(cliente.getByText("Volvemos en un rato, gracias.")).toHaveCount(0);
});

test("el dueño crea un usuario, la contraseña temporal sirve para entrar y al desactivarlo se corta", async ({ page, browser }) => {
  await ingresar(page, "owner@la-esquina.test");
  await page.goto("/admin/ajustes/usuarios");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  await page.getByLabel("Nombre").fill("Mozo E2E");
  await page.getByLabel("Email").fill(`mozo${DOMINIO}`);
  await page.getByRole("button", { name: "Crear usuario" }).click();
  const temporal = (await page.getByLabel("Contraseña temporal").textContent())!.trim();
  expect(temporal).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);

  const mozo = await nuevaPagina(browser);
  await ingresar(mozo, `mozo${DOMINIO}`, temporal);
  await expect(mozo.getByRole("link", { name: "Ajustes" }).first()).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("listitem", { name: "Mozo E2E" }).getByRole("button", { name: "Desactivar" }).click();
  await expect(page.getByRole("listitem", { name: "Mozo E2E" }).getByText("Desactivado")).toBeVisible();
  // La sesión del mozo quedó cerrada: la API del panel ya no lo deja entrar.
  expect((await mozo.request.get("/api/v1/admin/orders")).status()).toBe(401);

  await page.goto("/admin/ajustes/historial");
  await expect(page.getByText("Desactivó a Mozo E2E")).toBeVisible();
});
