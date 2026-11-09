import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { Client } from "pg";

/**
 * Fase 8: intentos manuales de las amenazas T1 a T4 (sección 18 del plan) contra la API real, con la
 * sesión de un usuario de la-esquina que apunta a datos de don-pepe. Complementa los tests de
 * aislamiento de integración: acá pasa por las rutas, la cookie y el control de origen.
 */

const CLAVE = process.env.SEED_PASSWORD ?? "";
test.skip(!CLAVE, "Falta SEED_PASSWORD en .env");
test.describe.configure({ mode: "serial" });

const ORIGEN = "http://localhost:3000";
const JSON_ORIGEN = { "content-type": "application/json", origin: ORIGEN };

async function sql<T = unknown>(consulta: string, valores: unknown[] = []): Promise<T[]> {
  const cliente = new Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  try {
    return (await cliente.query(consulta, valores)).rows as T[];
  } finally {
    await cliente.end();
  }
}

const DE = (slug: string) => `(SELECT id FROM business WHERE slug = '${slug}')`;

async function ingresar(page: Page, email: string): Promise<APIRequestContext> {
  await page.goto("/admin/ingresar");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/admin\/menu$/);
  return page.request;
}

test.beforeAll(async () => {
  await sql("DELETE FROM rate_limit_hit WHERE key LIKE 'login-%' OR key LIKE 'pedido-%' OR key LIKE 'seguimiento-%'");
});

test("T1: el dueño de un local no ve ni cambia nada de otro (404 en todas las rutas por ID)", async ({ page }) => {
  const api = await ingresar(page, "owner@la-esquina.test");
  const [ajenos] = await sql<Record<string, string>>(`SELECT
      (SELECT id FROM customer_order WHERE business_id = ${DE("don-pepe")} AND status NOT IN ('DELIVERED','CANCELLED') ORDER BY created_at DESC LIMIT 1) AS pedido,
      (SELECT id FROM customer_order WHERE business_id = ${DE("don-pepe")} ORDER BY created_at DESC LIMIT 1) AS cualquier_pedido,
      (SELECT id FROM product WHERE business_id = ${DE("don-pepe")} LIMIT 1) AS producto,
      (SELECT id FROM category WHERE business_id = ${DE("don-pepe")} LIMIT 1) AS categoria,
      (SELECT id FROM option_group WHERE business_id = ${DE("don-pepe")} LIMIT 1) AS grupo,
      (SELECT id FROM app_user WHERE business_id = ${DE("don-pepe")} AND role = 'STAFF' LIMIT 1) AS usuario`);
  const pedido = ajenos.pedido ?? ajenos.cualquier_pedido;
  for (const clave of ["producto", "categoria", "grupo", "usuario"]) expect(ajenos[clave], `el seed de don-pepe tiene ${clave}`).toBeTruthy();
  expect(pedido, "el seed de don-pepe tiene pedidos").toBeTruthy();
  const antes = await sql(`SELECT
      (SELECT row_to_json(o) FROM customer_order o WHERE id = $1) AS pedido,
      (SELECT row_to_json(p) FROM product p WHERE id = $2) AS producto,
      (SELECT row_to_json(c) FROM category c WHERE id = $3) AS categoria,
      (SELECT row_to_json(g) FROM option_group g WHERE id = $4) AS grupo,
      (SELECT row_to_json(u) FROM app_user u WHERE id = $5) AS usuario`, [pedido, ajenos.producto, ajenos.categoria, ajenos.grupo, ajenos.usuario]);

  const intentos: [string, string, unknown?][] = [
    ["GET", `/api/v1/admin/orders/${pedido}`],
    ["POST", `/api/v1/admin/orders/${pedido}/transition`, { toStatus: "CONFIRMED", expectedStatus: "PENDING", estimatedMinutes: 20 }],
    ["POST", `/api/v1/admin/orders/${pedido}/cancel`, { expectedStatus: "PENDING", reason: "OTHER" }],
    ["POST", `/api/v1/admin/orders/${pedido}/paid`, { paid: true }],
    ["POST", `/api/v1/admin/orders/${pedido}/whatsapp`, {}],
    ["GET", `/api/v1/admin/products/${ajenos.producto}`],
    ["PATCH", `/api/v1/admin/products/${ajenos.producto}`, { name: "Hackeado", expectedUpdatedAt: new Date().toISOString() }],
    ["PATCH", `/api/v1/admin/products/${ajenos.producto}/availability`, { isSoldOut: true }],
    ["DELETE", `/api/v1/admin/products/${ajenos.producto}`],
    ["PATCH", `/api/v1/admin/categories/${ajenos.categoria}`, { name: "Hackeada" }],
    ["DELETE", `/api/v1/admin/categories/${ajenos.categoria}`],
    ["DELETE", `/api/v1/admin/option-groups/${ajenos.grupo}`],
    ["PATCH", `/api/v1/admin/users/${ajenos.usuario}`, { isActive: false }],
    ["POST", `/api/v1/admin/users/${ajenos.usuario}/password`, {}],
  ];
  for (const [metodo, ruta, cuerpo] of intentos) {
    const r = await api.fetch(ruta, { method: metodo, headers: JSON_ORIGEN, data: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    expect(r.status(), `${metodo} ${ruta}`).toBe(404);
    expect(await r.text(), `${metodo} ${ruta}`).not.toMatch(/don-pepe|Don Pepe/i);
  }

  // Un ID de otro negocio en una lista (reordenar) tampoco cambia nada.
  const reorden = await api.post("/api/v1/admin/categories/reorder", { headers: JSON_ORIGEN, data: JSON.stringify({ ids: [ajenos.categoria] }) });
  expect([400, 404, 409, 422]).toContain(reorden.status());

  // Las listas solo traen lo propio.
  const listas = await Promise.all(["/api/v1/admin/orders", "/api/v1/admin/categories", "/api/v1/admin/users", "/api/v1/admin/audit", "/api/v1/admin/settings"].map((r) => api.get(r).then((x) => x.text())));
  for (const texto of listas) {
    for (const id of Object.values(ajenos)) if (id) expect(texto).not.toContain(id);
  }

  const despues = await sql(`SELECT
      (SELECT row_to_json(o) FROM customer_order o WHERE id = $1) AS pedido,
      (SELECT row_to_json(p) FROM product p WHERE id = $2) AS producto,
      (SELECT row_to_json(c) FROM category c WHERE id = $3) AS categoria,
      (SELECT row_to_json(g) FROM option_group g WHERE id = $4) AS grupo,
      (SELECT row_to_json(u) FROM app_user u WHERE id = $5) AS usuario`, [pedido, ajenos.producto, ajenos.categoria, ajenos.grupo, ajenos.usuario]);
  expect(despues).toEqual(antes);
});

test("T1: un businessId en el cuerpo no cambia de negocio (campo desconocido → 400)", async ({ page }) => {
  const api = await ingresar(page, "owner@la-esquina.test");
  const [donPepe] = await sql<{ id: string }>(`SELECT id FROM business WHERE slug = 'don-pepe'`);
  const r = await api.post("/api/v1/admin/categories", { headers: JSON_ORIGEN, data: JSON.stringify({ name: "Intrusa", businessId: donPepe.id }) });
  expect(r.status()).toBe(400);
  expect(await sql(`SELECT id FROM category WHERE name = 'Intrusa'`)).toEqual([]);
});

test("roles, CSRF y sesión: personal sin permisos, origen ajeno, sin cookie", async ({ page, playwright }) => {
  const api = await ingresar(page, "staff@la-esquina.test");
  for (const [metodo, ruta] of [
    ["GET", "/api/v1/admin/users"],
    ["GET", "/api/v1/admin/audit"],
    ["GET", "/api/v1/admin/metrics?from=2026-10-01&to=2026-10-02"],
    ["POST", "/api/v1/admin/categories"],
  ] as const) {
    const r = await api.fetch(ruta, { method: metodo, headers: JSON_ORIGEN, data: metodo === "POST" ? JSON.stringify({ name: "No" }) : undefined });
    expect(r.status(), `${metodo} ${ruta}`).toBe(403);
  }
  // Escrituras con la sesión válida pero desde otro sitio, sin Origin o sin JSON.
  const pausa = JSON.stringify({ acceptingOrders: true });
  expect((await api.post("/api/v1/admin/settings/pause", { headers: { "content-type": "application/json", origin: "https://malo.example" }, data: pausa })).status()).toBe(403);
  expect((await api.post("/api/v1/admin/settings/pause", { headers: { "content-type": "application/json" }, data: pausa })).status()).toBe(403);
  expect((await api.post("/api/v1/admin/settings/pause", { headers: { "content-type": "text/plain", origin: ORIGEN }, data: pausa })).status()).toBe(400);

  // Sin cookie: 401, sin detalles internos.
  const anonimo = await playwright.request.newContext({ baseURL: ORIGEN });
  for (const ruta of ["/api/v1/admin/orders", "/api/v1/admin/users", "/api/v1/admin/settings"]) {
    const r = await anonimo.get(ruta);
    expect(r.status(), ruta).toBe(401);
    expect(await r.text()).not.toMatch(/at .*\.(ts|js):\d+|prisma|stack/i);
  }
  // Una cookie inventada tampoco sirve.
  const falsa = await playwright.request.newContext({ baseURL: ORIGEN, extraHTTPHeaders: { cookie: `sesion=${"x".repeat(43)}; __Host-sesion=${"x".repeat(43)}` } });
  expect((await falsa.get("/api/v1/admin/orders")).status()).toBe(401);
  await Promise.all([anonimo.dispose(), falsa.dispose()]);
});

test("T5: el 6.º login fallido seguido da 429 con mensaje genérico", async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: ORIGEN, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.77" } });
  const intento = (password: string) => api.post("/api/v1/admin/auth/login", { headers: JSON_ORIGEN, data: JSON.stringify({ email: "manager@la-esquina.test", password }) });
  for (let i = 0; i < 5; i++) {
    const r = await intento(`mala-${i}-clave`);
    expect(r.status()).toBe(401);
  }
  const bloqueado = await intento(CLAVE); // ni con la contraseña correcta
  expect(bloqueado.status()).toBe(429);
  const otro = await api.post("/api/v1/admin/auth/login", { headers: JSON_ORIGEN, data: JSON.stringify({ email: "nadie@no-existe.test", password: "x" }) });
  expect((await otro.json()).error.message).not.toMatch(/no existe|email/i);
  await api.dispose();
  await sql("DELETE FROM rate_limit_hit WHERE key LIKE 'login-%'");
});

test("T3 y T2: precios del navegador ignorados y límite de pedidos por IP", async ({ playwright }) => {
  // la-esquina abre todo el día durante la prueba; al final se restauran sus horarios.
  const horarios = await sql<{ weekday: number; opens_min: number; closes_min: number }>(`SELECT weekday, opens_min, closes_min FROM opening_hour WHERE business_id = ${DE("la-esquina")}`);
  await sql(`DELETE FROM opening_hour WHERE business_id = ${DE("la-esquina")}`);
  for (let dia = 0; dia < 7; dia++) await sql(`INSERT INTO opening_hour (business_id, weekday, opens_min, closes_min) VALUES (${DE("la-esquina")}, $1, 0, 1439)`, [dia]);
  const api = await playwright.request.newContext({ baseURL: ORIGEN, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.88" } });
  try {
    const menu = await (await api.get("/api/v1/public/la-esquina/menu")).json();
    const gaseosa = menu.categories.flatMap((c: { products: { id: string; name: string; priceCents: number }[] }) => c.products).find((p: { name: string }) => p.name === "Gaseosa 1,5 L");
    const cuerpo = (telefono: string, precio?: number) =>
      JSON.stringify({
        clientRequestId: randomUUID(),
        menuVersion: menu.business.menuVersion,
        fulfillment: "PICKUP",
        customer: { name: "Prueba T3", phone: telefono },
        payment: { method: "CASH" },
        items: [{ productId: gaseosa.id, quantity: 3, ...(precio !== undefined && { expectedUnitCents: precio }) }],
      });

    // T3: un precio de $ 1 no se cobra: el servidor avisa que el menú cambió (409) y no crea nada.
    const barato = await api.post("/api/v1/public/la-esquina/orders", { headers: JSON_ORIGEN, data: cuerpo("381 555 7001", 100) });
    expect(barato.status()).toBe(409);
    expect((await barato.json()).error.code).toBe("MENU_CHANGED");
    // Sin precio, el total es el del menú.
    const normal = await api.post("/api/v1/public/la-esquina/orders", { headers: JSON_ORIGEN, data: cuerpo("381 555 7002") });
    expect(normal.status()).toBe(201);
    const creado = (await normal.json()).order;
    const [guardado] = await sql<{ subtotal_cents: number }>(`SELECT subtotal_cents FROM customer_order WHERE public_token = $1`, [creado.token]);
    expect(guardado.subtotal_cents).toBe(3 * gaseosa.priceCents);

    // T4: el token de la-esquina no sirve con el slug de otro local; el código corto no da acceso.
    expect((await api.get(`/api/v1/public/don-pepe/orders/${creado.token}`)).status()).toBe(404);
    expect((await api.get(`/api/v1/public/la-esquina/orders/${creado.code}`)).status()).toBe(404);
    expect((await api.get(`/api/v1/public/la-esquina/orders/${creado.token}`)).status()).toBe(200);

    // T2: desde la misma IP, el pedido 11 del minuto da 429 (ya van 2 intentos).
    const estados: number[] = [];
    for (let i = 0; i < 10; i++) estados.push((await api.post("/api/v1/public/la-esquina/orders", { headers: JSON_ORIGEN, data: cuerpo(`381 556 70${10 + i}`) })).status());
    expect(estados.filter((s) => s === 201).length).toBeLessThanOrEqual(9);
    expect(estados.at(-1)).toBe(429);
  } finally {
    await api.dispose();
    const PRUEBA = `SELECT id FROM customer_order WHERE business_id = ${DE("la-esquina")} AND customer_name = 'Prueba T3'`;
    await sql(`DELETE FROM order_item_option WHERE order_item_id IN (SELECT id FROM order_item WHERE order_id IN (${PRUEBA}))`);
    await sql(`DELETE FROM order_item WHERE order_id IN (${PRUEBA})`);
    await sql(`DELETE FROM order_status_history WHERE order_id IN (${PRUEBA})`);
    await sql(`DELETE FROM customer_order WHERE id IN (${PRUEBA})`);
    await sql(`DELETE FROM opening_hour WHERE business_id = ${DE("la-esquina")}`);
    for (const h of horarios) await sql(`INSERT INTO opening_hour (business_id, weekday, opens_min, closes_min) VALUES (${DE("la-esquina")}, $1, $2, $3)`, [h.weekday, h.opens_min, h.closes_min]);
    await sql("DELETE FROM rate_limit_hit WHERE key LIKE 'pedido-%'");
  }
});

test("T4: probar tokens de seguimiento al azar termina en 429", async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: ORIGEN, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.99" } });
  const estados: number[] = [];
  for (let i = 0; i < 32; i++) estados.push((await api.get(`/api/v1/public/la-esquina/orders/${randomUUID().replace(/-/g, "").slice(0, 22)}`)).status());
  expect(estados.slice(0, 30).every((s) => s === 404)).toBe(true);
  expect(estados.at(-1)).toBe(429);
  await api.dispose();
  await sql("DELETE FROM rate_limit_hit WHERE key LIKE 'seguimiento-%'");
});
