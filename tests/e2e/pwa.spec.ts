import "dotenv/config";
import { expect, test } from "@playwright/test";

/** PWA del panel (Fase 5b): manifest, íconos y service worker. El push real se prueba en un celular. */

test("el panel enlaza su manifest y el menú público no", async ({ page, request }) => {
  await page.goto("/admin/ingresar");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/panel.webmanifest");
  await page.goto("/la-esquina");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);

  const r = await request.get("/panel.webmanifest");
  expect(r.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await r.json();
  expect(manifest).toMatchObject({ start_url: "/admin", scope: "/admin", display: "standalone" });
  for (const icono of manifest.icons) expect((await request.get(icono.src)).headers()["content-type"]).toBe("image/png");
});

test("el service worker se sirve sin caché y controla la pantalla de pedidos (/admin)", async ({ page, request }) => {
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(sw.headers()["cache-control"]).toContain("no-store");
  expect(sw.headers()["content-type"]).toContain("javascript");

  await page.goto("/admin/ingresar");
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.register("/sw.js", { scope: "/admin" })).scope);
  expect(new URL(scope).pathname).toBe("/admin");
});

test("con sesión, la pantalla de pedidos (/admin) queda controlada por el service worker", async ({ page }) => {
  const clave = process.env.SEED_PASSWORD ?? "";
  test.skip(!clave, "Falta SEED_PASSWORD en .env");
  await page.goto("/admin/ingresar");
  await page.getByLabel("Email").fill("staff@la-esquina.test");
  await page.getByLabel("Contraseña").fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/admin\/menu$/);
  await page.goto("/admin");
  // El panel registra el service worker al cargar; después de recargar, la página tiene que estar controlada.
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration("/admin"))?.active)), { timeout: 10_000 }).toBe(true);
  await page.reload();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // Chromium sin interfaz deja el permiso de notificaciones en "denegado": se ve el botón, en el estado que sea.
  await expect(page.getByRole("button", { name: /avisos/i }).first()).toBeVisible();
});
