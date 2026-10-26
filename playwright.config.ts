import { defineConfig } from "@playwright/test";

/** Pruebas en navegador real. Usan el servidor de desarrollo y la base local. */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
  },
  // Build de producción contra la base local: sin el Fast Refresh del modo desarrollo, que a veces
  // recarga la página en medio de una prueba. Para probar contra `npm run dev`, levantarlo antes.
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000/api/v1/health",
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
