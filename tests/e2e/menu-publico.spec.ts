import { expect, test, type Page } from "@playwright/test";

/**
 * Menú público y carrito (Fase 4) sobre el piloto Hawken's Food de la base local (`npm run db:piloto`).
 * La hora se fija con el reloj de Playwright: el piloto abre todos los días de 19:00 a 00:00.
 */

const SLUG = "/hawkens-food";
const ABIERTO = new Date("2026-10-21T21:00:00-03:00");
const CERRADO = new Date("2026-10-21T15:00:00-03:00");
const ANCHOS = [360, 390, 768, 1024, 1440];

/** "$ 22.000" con el espacio duro que usa Intl. */
const pesos = (texto: string) => new RegExp(texto.replace("$ ", "\\$\\s"));

async function abrirMenu(page: Page, hora = ABIERTO) {
  await page.clock.setFixedTime(hora);
  await page.goto(SLUG);
  await expect(page.getByRole("heading", { level: 1, name: "Hawken's Food" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(SLUG);
  await page.evaluate(() => localStorage.clear());
});

test("armar un pedido con opciones, editarlo en el carrito y que sobreviva a recargar", async ({ page }) => {
  await abrirMenu(page);
  await expect(page.getByText("Abierto: tomando pedidos")).toBeVisible();

  // Producto con opciones: hoja inferior con el grupo obligatorio ya elegido.
  await page.getByRole("button", { name: "Agregar Cheesse" }).click();
  const hoja = page.getByRole("dialog", { name: "Cheesse" });
  await expect(hoja.getByRole("radio", { name: "Simple" })).toBeChecked();
  await hoja.getByText("Doble").click();
  await expect(hoja.getByRole("button", { name: /Agregar/ })).toHaveText(pesos("$ 10.000"));
  await hoja.getByRole("button", { name: /Agregar/ }).click();
  await expect(hoja).toBeHidden();

  // Producto sin opciones: un toque lo agrega.
  await page.getByRole("button", { name: "Agregar Hamburguesa Billy" }).click();
  const barra = page.getByRole("link", { name: /Ver carrito/ });
  await expect(barra).toContainText("2 productos");
  await expect(barra).toContainText(pesos("$ 22.000"));

  await barra.click();
  await expect(page).toHaveURL(`${SLUG}/carrito`);
  await expect(page.getByText("Doble")).toBeVisible();
  await expect(page.getByText("Subtotal").locator("..")).toContainText(pesos("$ 22.000"));

  await page.getByRole("button", { name: "Sumar uno de Hamburguesa Billy" }).click();
  await expect(page.getByText("Subtotal").locator("..")).toContainText(pesos("$ 34.000"));

  // Editar las opciones desde el carrito.
  await page.getByRole("button", { name: "Editar" }).click();
  const edicion = page.getByRole("dialog", { name: "Cheesse" });
  await expect(edicion.getByRole("radio", { name: "Doble" })).toBeChecked();
  await edicion.getByText("Triple").click();
  await edicion.getByRole("button", { name: /Guardar/ }).click();
  // Mientras el diálogo se cierra, "Triple" todavía se ve adentro: se espera a que desaparezca.
  await expect(edicion).toBeHidden();
  await expect(page.getByText("Triple")).toBeVisible();
  await expect(page.getByText("Subtotal").locator("..")).toContainText(pesos("$ 35.000"));

  await page.reload();
  await expect(page.getByText("Subtotal").locator("..")).toContainText(pesos("$ 35.000"));

  await page.getByRole("button", { name: "Quitar Cheesse" }).click();
  await page.getByRole("button", { name: "Quitar Hamburguesa Billy" }).click();
  await expect(page.getByText("Tu carrito está vacío")).toBeVisible();
});

test("fuera de horario el menú queda en lectura y dice cuándo abre", async ({ page }) => {
  await abrirMenu(page, CERRADO);
  await expect(page.getByText("Cerrado")).toBeVisible();
  await expect(page.getByText("Abre hoy a las 19:00")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Agregar / })).toHaveCount(0);
  await expect(page.getByText("Cheesse")).toBeVisible();
});

test("si el precio cambió desde que se armó el carrito, lo avisa y deja aceptar el nuevo", async ({ page }) => {
  await abrirMenu(page);
  await page.getByRole("button", { name: "Agregar Hamburguesa Billy" }).click();
  // Simula un carrito armado cuando la Billy costaba $ 10.000.
  await page.evaluate(() => {
    const clave = "carrito:hawkens-food";
    const carrito = JSON.parse(localStorage.getItem(clave)!);
    carrito.items[0].unitCents = 1_000_000;
    localStorage.setItem(clave, JSON.stringify(carrito));
  });
  await page.goto(`${SLUG}/carrito`);
  const aviso = page.getByRole("alert").filter({ hasText: "El menú cambió" });
  await expect(aviso).toBeVisible();
  await expect(page.getByText(/Antes .* ahora .* c\/u/)).toBeVisible();
  await page.getByRole("button", { name: "Aceptar precios nuevos" }).click();
  await expect(aviso).toBeHidden();
});

test("un negocio que no existe muestra la página de no encontrado", async ({ page }) => {
  await page.goto("/no-existe-este-local");
  await expect(page.getByText("No encontramos esta página")).toBeVisible();
});

for (const ancho of ANCHOS) {
  test(`sin scroll horizontal y con objetivos táctiles de 44 px a ${ancho} px`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await abrirMenu(page);
    await page.getByRole("button", { name: "Agregar Hamburguesa Billy" }).click();

    for (const ruta of [SLUG, `${SLUG}/carrito`]) {
      await page.goto(ruta);
      await expect(page.locator("main")).toBeVisible();
      const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(desborde, `${ruta} a ${ancho} px`).toBeLessThanOrEqual(0);

      const chicos = await page.evaluate(() =>
        [...document.querySelectorAll("main button, main a, nav a, body > div a")]
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { texto: (el as HTMLElement).innerText || el.getAttribute("aria-label"), alto: r.height, ancho: r.width };
          })
          .filter((r) => r.alto < 44 || r.ancho < 44),
      );
      expect(chicos, `${ruta} a ${ancho} px`).toEqual([]);
    }
  });
}
