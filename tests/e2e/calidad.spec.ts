import "dotenv/config";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

/**
 * Fase 8: cabeceras de seguridad, CSP sin violaciones y accesibilidad (axe, WCAG 2.1 A y AA) en las
 * pantallas principales del cliente y del panel, sobre la-esquina del seed.
 */

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

/** Junta las violaciones de CSP que reporta el navegador (evento y consola). */
async function vigilarCsp(page: Page): Promise<string[]> {
  const violaciones: string[] = [];
  await page.exposeFunction("__violacionCsp", (v: string) => violaciones.push(v));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __violacionCsp: (v: string) => void }).__violacionCsp(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`);
    });
  });
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) violaciones.push(m.text());
  });
  return violaciones;
}

async function revisarAccesibilidad(page: Page, pantalla: string, violacionesCsp: string[]) {
  const antes = violacionesCsp.length;
  // Las entradas animadas (opacidad) falsean el contraste: se mide cuando terminaron (las infinitas no cuentan).
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const resumen = violations.map((v) => `${pantalla}: ${v.id} (${v.impact}) → ${v.nodes.slice(0, 3).map((n) => `${n.html} ${n.failureSummary ?? ""}`).join(" | ")}`);
  // axe se inyecta con eval: lo que la CSP bloquea mientras corre es de la herramienta, no de la app.
  await page.waitForTimeout(100);
  violacionesCsp.splice(antes, violacionesCsp.length - antes, ...violacionesCsp.slice(antes).filter((v) => !/eval/.test(v)));
  expect(resumen, `Problemas de accesibilidad en ${pantalla}`).toEqual([]);
}

test.beforeAll(async () => {
  await sql("DELETE FROM rate_limit_hit WHERE key LIKE 'login-%'");
});

test("las respuestas llevan las cabeceras de seguridad", async ({ request }) => {
  for (const ruta of ["/la-esquina", "/admin/ingresar", "/api/v1/health"]) {
    const r = await request.get(ruta);
    const h = r.headers();
    expect(h["content-security-policy"], ruta).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"], ruta).toContain("object-src 'none'");
    expect(h["content-security-policy"], ruta).toMatch(/img-src [^;]*\*\.public\.blob\.vercel-storage\.com/);
    expect(h["x-content-type-options"], ruta).toBe("nosniff");
    expect(h["x-frame-options"], ruta).toBe("DENY");
    expect(h["referrer-policy"], ruta).toBe("strict-origin-when-cross-origin");
    expect(h["cross-origin-opener-policy"], ruta).toBe("same-origin");
    expect(h["x-powered-by"], ruta).toBeUndefined();
  }
});

test("cliente: menú, producto, carrito, confirmación y seguimiento sin violaciones de CSP ni de accesibilidad", async ({ page }) => {
  const violaciones = await vigilarCsp(page);
  await page.clock.setFixedTime(new Date("2026-10-21T21:00:00-03:00")); // miércoles, abierto
  await page.goto("/la-esquina");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await revisarAccesibilidad(page, "menú", violaciones);

  await page.getByRole("button", { name: "Agregar Gaseosa 1,5 L" }).click();
  await page.getByRole("button", { name: "Agregar Gaseosa 1,5 L" }).click();
  await page.getByRole("button", { name: "Agregar Milanesa napolitana" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await revisarAccesibilidad(page, "hoja de producto", violaciones);
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: /Ver carrito/ }).click();
  await expect(page).toHaveURL(/\/carrito$/);
  await expect(page.getByRole("link", { name: /Continuar/ })).toBeVisible();
  await revisarAccesibilidad(page, "carrito", violaciones);

  await page.getByRole("link", { name: /Continuar/ }).click();
  await expect(page).toHaveURL(/\/confirmar$/);
  await expect(page.getByLabel("Nombre")).toBeVisible();
  await revisarAccesibilidad(page, "confirmar", violaciones);

  const [pedido] = await sql<{ public_token: string }>("SELECT public_token FROM customer_order WHERE business_id = (SELECT id FROM business WHERE slug = 'la-esquina') ORDER BY created_at DESC LIMIT 1");
  if (pedido) {
    await page.goto(`/la-esquina/pedido/${pedido.public_token}`);
    await expect(page.getByLabel(/^Código/)).toBeVisible();
    await revisarAccesibilidad(page, "seguimiento", violaciones);
  }
  expect(violaciones).toEqual([]);
});

test("panel: ingreso, pedidos, menú, ajustes y métricas sin violaciones de CSP ni de accesibilidad", async ({ page }) => {
  const violaciones = await vigilarCsp(page);
  await page.goto("/admin/ingresar");
  await revisarAccesibilidad(page, "ingreso", violaciones);
  await page.getByLabel("Email").fill("owner@la-esquina.test");
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/admin\/menu$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await revisarAccesibilidad(page, "menú del panel", violaciones);

  for (const [ruta, pantalla] of [
    ["/admin", "pedidos"],
    ["/admin/ajustes", "ajustes"],
    ["/admin/ajustes/usuarios", "usuarios"],
    ["/admin/ajustes/historial", "historial"],
    ["/admin/metricas", "métricas"],
  ] as const) {
    await page.goto(ruta);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await revisarAccesibilidad(page, pantalla, violaciones);
  }
  expect(violaciones).toEqual([]);
});
