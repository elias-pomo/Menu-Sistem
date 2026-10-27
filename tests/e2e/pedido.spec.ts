import "dotenv/config";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";

/**
 * Pedido de punta a punta (Fase 5, flujos críticos 1, 2 y 5 de la sección 19) sobre la-esquina del
 * seed. El servidor valida el horario con la hora real, así que durante la prueba el local abre
 * todo el día; al final se restauran sus horarios.
 */

const CLAVE = process.env.SEED_PASSWORD ?? "";
test.skip(!CLAVE, "Falta SEED_PASSWORD en .env");
test.describe.configure({ mode: "serial" });

let horarios: { weekday: number; opens_min: number; closes_min: number }[] = [];

async function sql<T = unknown>(consulta: string, valores: unknown[] = []): Promise<T[]> {
  const cliente = new Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  try {
    return (await cliente.query(consulta, valores)).rows as T[];
  } finally {
    await cliente.end();
  }
}

const ESQUINA = "(SELECT id FROM business WHERE slug = 'la-esquina')";

test.beforeAll(async () => {
  horarios = await sql(`SELECT weekday, opens_min, closes_min FROM opening_hour WHERE business_id = ${ESQUINA}`);
  await sql(`DELETE FROM opening_hour WHERE business_id = ${ESQUINA}`);
  for (let dia = 0; dia < 7; dia++) await sql(`INSERT INTO opening_hour (business_id, weekday, opens_min, closes_min) VALUES (${ESQUINA}, $1, 0, 1439)`, [dia]);
  await sql("DELETE FROM rate_limit_hit WHERE key LIKE 'login-%' OR key LIKE 'pedido-%'");
});

test.afterAll(async () => {
  await sql(`DELETE FROM opening_hour WHERE business_id = ${ESQUINA}`);
  for (const h of horarios) await sql(`INSERT INTO opening_hour (business_id, weekday, opens_min, closes_min) VALUES (${ESQUINA}, $1, $2, $3)`, [h.weekday, h.opens_min, h.closes_min]);
});

async function panel(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/admin/ingresar");
  await page.getByLabel("Email").fill("staff@la-esquina.test");
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/admin\/menu$/);
  await page.goto("/admin");
  return page;
}

/** Un cliente arma 2 gaseosas (llega al mínimo de $ 5.000) y confirma con retiro. Devuelve el código. */
async function hacerPedido(page: Page, nombre: string, telefono: string): Promise<string> {
  await page.goto("/la-esquina");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const gaseosa = page.getByRole("button", { name: "Agregar Gaseosa 1,5 L" });
  await gaseosa.click();
  await gaseosa.click();
  await page.getByRole("link", { name: /Ver carrito/ }).click();
  await page.getByRole("link", { name: /Continuar/ }).click();
  await expect(page).toHaveURL(/\/la-esquina\/confirmar$/);

  await page.getByLabel("Nombre").fill(nombre);
  await page.getByLabel("Celular").fill(telefono);
  await page.getByRole("button", { name: /Confirmar pedido/ }).dblclick(); // el doble toque no duplica
  await expect(page).toHaveURL(/\/la-esquina\/pedido\/[A-Za-z0-9_-]{22}$/);
  await expect(page.getByRole("status")).toHaveText("Pedido enviado. Falta que el local lo confirme.");
  const codigo = (await page.getByLabel(/^Código/).textContent())!.trim();
  expect(codigo).toMatch(/^[2-9A-HJKMNP-Z]{4}$/);
  return codigo;
}

test("pedido de retiro: el cliente lo envía, el local lo confirma con minutos y lo lleva hasta entregado", async ({ page, browser }) => {
  const sufijo = String(Date.now()).slice(-4);
  const codigo = await hacerPedido(page, `Ana ${sufijo}`, `381 556 ${sufijo}`);

  // El panel lo muestra en Nuevos en 10 s o menos (CA-02).
  const local = await panel(browser);
  const tarjeta = local.getByRole("article", { name: `Pedido ${codigo}` });
  await expect(tarjeta).toBeVisible({ timeout: 10_000 });
  await expect(local.getByRole("heading", { name: /Nuevos/ })).toBeVisible();
  await expect(local).toHaveTitle(/^\(\d+\) Pedidos/);

  await tarjeta.getByRole("button", { name: "Confirmar" }).click();
  await tarjeta.getByRole("button", { name: "30′" }).click();
  await expect(tarjeta.getByRole("button", { name: "Empezar" })).toBeVisible();

  // WhatsApp (RF-027): el enlace abre el chat del cliente con el mensaje de "confirmado" ya escrito.
  const whatsapp = tarjeta.getByRole("link", { name: "WhatsApp" });
  const enlace = new URL((await whatsapp.getAttribute("href"))!);
  expect(`${enlace.origin}${enlace.pathname}`).toBe(`https://wa.me/549381556${sufijo}`);
  const texto = enlace.searchParams.get("text")!;
  expect(texto).toContain(`¡Hola Ana! Confirmamos tu pedido ${codigo}`);
  expect(texto).toContain("unos 30 minutos");
  expect(texto).toMatch(/\/la-esquina\/pedido\/[A-Za-z0-9_-]{22}$/);
  // El chat se abre en otra pestaña: se intercepta para no salir a internet.
  await local.context().route("https://wa.me/**", (r) => r.fulfill({ status: 200, body: "ok" }));
  const [pestana] = await Promise.all([local.context().waitForEvent("page"), whatsapp.click()]);
  await pestana.close();
  await expect(tarjeta.getByRole("link", { name: "Mensaje preparado" })).toBeVisible();
  await tarjeta.getByText(`Ana ${sufijo}`).click();
  await expect(local.getByRole("dialog").getByText(/Se abrió WhatsApp \(confirmado\)/)).toBeVisible();
  await local.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();

  // El cliente ve el cambio en el seguimiento (se refresca cada 15 s).
  await expect(page.getByRole("status")).toHaveText("El local confirmó tu pedido. Tiempo estimado: 30 min.", { timeout: 20_000 });

  await tarjeta.getByRole("button", { name: "Empezar" }).click();
  await tarjeta.getByRole("button", { name: "Listo" }).click();
  await tarjeta.getByRole("button", { name: "Entregado" }).click();
  await expect(tarjeta).toHaveCount(0);

  // Queda en Terminados; se marca cobrado desde el detalle.
  await local.getByText(/Terminados hoy/).click();
  await local.getByRole("button", { name: new RegExp(codigo) }).click();
  const detalle = local.getByRole("dialog");
  await expect(detalle.getByText("Entregado", { exact: true })).toBeVisible();
  await detalle.getByRole("checkbox", { name: /Cobrado/ }).click();
  await expect(detalle.getByRole("checkbox", { name: /Cobrado/ })).toBeChecked();

  await expect(page.getByRole("status")).toHaveText("Entregado. ¡Gracias!", { timeout: 20_000 });
  expect(await sql("SELECT count(*)::int AS n FROM customer_order WHERE public_code = $1 AND business_id = " + ESQUINA, [codigo])).toEqual([{ n: 1 }]);
});

test("el local rechaza un pedido con motivo y el cliente lo ve cancelado", async ({ page, browser }) => {
  const sufijo = String(Date.now()).slice(-4);
  const codigo = await hacerPedido(page, `Juan ${sufijo}`, `381 557 ${sufijo}`);
  const local = await panel(browser);
  const tarjeta = local.getByRole("article", { name: `Pedido ${codigo}` });
  await expect(tarjeta).toBeVisible({ timeout: 10_000 });

  await tarjeta.getByText(`Juan ${sufijo}`).click();
  const detalle = local.getByRole("dialog");
  await detalle.getByRole("button", { name: "Rechazar" }).click();
  await expect(detalle.getByRole("button", { name: "Cancelar pedido" })).toBeDisabled();
  await detalle.getByLabel("Motivo").selectOption("OUT_OF_STOCK");
  await detalle.getByRole("button", { name: "Cancelar pedido" }).click();
  await expect(detalle.getByText("Cancelado", { exact: true })).toBeVisible();
  await expect(detalle.getByText(/Sin stock/)).toBeVisible();

  await expect(page.getByRole("status")).toHaveText("El local canceló el pedido.", { timeout: 20_000 });
});
