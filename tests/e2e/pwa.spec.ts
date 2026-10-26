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

test("el service worker se sirve sin caché y se registra solo para /admin/", async ({ page, request }) => {
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(sw.headers()["cache-control"]).toContain("no-store");
  expect(sw.headers()["content-type"]).toContain("javascript");

  await page.goto("/admin/ingresar");
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.register("/sw.js", { scope: "/admin/" })).scope);
  expect(new URL(scope).pathname).toBe("/admin/");
});
