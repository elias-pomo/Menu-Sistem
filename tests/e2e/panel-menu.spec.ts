import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

/**
 * Panel del menú (Fase 6a) sobre el negocio la-esquina del seed (`npm run db:seed`). Usa los usuarios
 * de prueba del seed con la contraseña de SEED_PASSWORD (.env).
 */

const CLAVE = process.env.SEED_PASSWORD ?? "";
// La Esquina abre de lunes a sábado de 19:30 a 23:30.
const ABIERTO = new Date("2026-10-21T21:00:00-03:00");

async function ingresar(page: Page, rol: "manager" | "staff") {
  await page.goto("/admin/ingresar");
  await page.getByLabel("Email").fill(`${rol}@la-esquina.test`);
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/admin\/menu$/);
}

test.skip(!CLAVE, "Falta SEED_PASSWORD en .env");

// Los intentos fallidos de corridas anteriores (todos desde localhost) no deben bloquear el ingreso.
test.beforeEach(async () => {
  const cliente = new Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  await cliente.query("DELETE FROM rate_limit_hit WHERE key LIKE 'login-%'");
  await cliente.end();
});

test("sin sesión, el panel lleva al ingreso y la API responde 401", async ({ page, request }) => {
  await page.goto("/admin/menu");
  await expect(page).toHaveURL(/\/admin\/ingresar$/);
  const respuesta = await request.get("/api/v1/admin/categories");
  expect(respuesta.status()).toBe(401);
});

test("datos incorrectos dan un mensaje genérico", async ({ page }) => {
  await page.goto("/admin/ingresar");
  await page.getByLabel("Email").fill("manager@la-esquina.test");
  await page.getByLabel("Contraseña").fill("no-es-la-clave");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Datos incorrectos." })).toBeVisible();
});

test("el encargado crea categoría, grupo y producto, lo marca agotado y el menú público lo refleja", async ({ page, context }) => {
  const sufijo = Date.now().toString().slice(-6);
  const categoria = `Postres ${sufijo}`;
  const grupo = `Porción ${sufijo}`;
  const producto = `Flan ${sufijo}`;
  await ingresar(page, "manager");

  await page.getByPlaceholder("Nueva categoría").fill(categoria);
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByRole("heading", { name: categoria })).toBeVisible();

  // Grupo de opciones con un adicional.
  await page.getByRole("link", { name: /Opciones/ }).click();
  await page.getByRole("button", { name: "Grupo" }).click();
  await page.getByLabel("Nombre del grupo").fill(grupo);
  await page.getByLabel("Nombre de la opción 1").fill("Chica");
  await page.getByRole("button", { name: "Agregar opción" }).click();
  await page.getByLabel("Nombre de la opción 2").fill("Grande");
  await page.getByLabel("Adicional de la opción 2").fill("1.000");
  await page.getByRole("button", { name: "Guardar grupo" }).click();
  await expect(page.getByRole("heading", { name: grupo })).toBeVisible();

  // Producto nuevo en la categoría, con el grupo.
  await page.goto("/admin/menu/productos/nuevo");
  await page.getByLabel("Nombre").fill(producto);
  await page.getByLabel("Categoría").selectOption({ label: categoria });
  await page.getByLabel("Precio").fill("3.500");
  await expect(page.getByText(/Se muestra como \$\s3\.500/)).toBeVisible();
  await page.getByRole("checkbox", { name: new RegExp(grupo) }).check();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/admin\/menu$/);
  await expect(page.getByText(producto)).toBeVisible();

  // En el menú público aparece con su grupo y el "Desde".
  const publico = await context.newPage();
  await publico.clock.setFixedTime(ABIERTO);
  await publico.goto("/la-esquina");
  await publico.getByRole("button", { name: `Agregar ${producto}` }).click();
  await expect(publico.getByRole("dialog", { name: producto }).getByText("Grande")).toBeVisible();

  // Agotado en un toque: el menú público lo muestra enseguida.
  const fila = page.getByRole("listitem").filter({ hasText: producto });
  // La casilla cambia cuando el servidor confirma: se toca y se espera el estado nuevo.
  await fila.getByRole("checkbox", { name: "Agotado" }).click();
  await expect(fila.getByRole("checkbox", { name: "Agotado" })).toBeChecked();
  await publico.reload();
  await expect(publico.getByRole("button", { name: `Agregar ${producto}` })).toHaveCount(0);
  await expect(publico.getByText(producto)).toBeVisible();

  // Limpieza: archivar la categoría (y su producto) y el grupo.
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: `Archivar ${categoria}` }).click();
  await expect(page.getByRole("heading", { name: categoria })).toHaveCount(0);
  await page.goto("/admin/menu/opciones");
  await page.getByRole("article").filter({ hasText: grupo }).getByRole("button", { name: "Editar" }).click();
  await page.getByRole("button", { name: "Archivar" }).click();
  await expect(page.getByRole("heading", { name: grupo })).toHaveCount(0);
});

test("el personal puede marcar agotado pero no ve las acciones de edición", async ({ page }) => {
  await ingresar(page, "staff");
  await expect(page.getByRole("checkbox", { name: "Agotado" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Producto/ })).toHaveCount(0);
  await expect(page.getByPlaceholder("Nueva categoría")).toHaveCount(0);
  await page.goto("/admin/menu/opciones");
  await expect(page).toHaveURL(/\/admin\/menu$/);
});
