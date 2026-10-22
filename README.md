# Pedidos para casas de comida

Menú digital, pedidos y panel para casas de comida de barrio. Plataforma multi-negocio en Next.js 16,
Prisma 7 y PostgreSQL. El plan completo está en [docs/PLAN.md](docs/PLAN.md).

## Requisitos

- Node 22 o superior.

## Primeros pasos

1. `npm install` (corre `prisma generate`).
2. `npm run db:dev` levanta la base local (`prisma dev`, PGlite). `npx prisma dev ls` muestra las URLs.
3. Copiar `.env.example` a `.env` y completar `DATABASE_URL` y `SHADOW_DATABASE_URL` con las URLs TCP
   (`postgres://...`) del paso anterior, `DATABASE_POOL_MAX="1"` y una `SEED_PASSWORD` de 10 caracteres o más.
4. `npx prisma migrate deploy && npm run db:seed`.
5. `npm run dev` y abrir http://localhost:3000/api/v1/health.

El seed crea dos negocios (`la-esquina` y `don-pepe`) con un usuario por rol:
`owner@<slug>.test`, `manager@<slug>.test` y `staff@<slug>.test`, todos con la contraseña de `SEED_PASSWORD`.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Tests unitarios y de integración (los de integración necesitan la base con el seed) |
| `npm run typecheck` / `npm run lint` | Tipos y lint |
| `npm run test:e2e` | Pruebas en navegador con Playwright (`npx playwright install chromium` la primera vez) |
| `npm run db:migrate` | Crear y aplicar una migración nueva (interactivo) |
| `npm run db:deploy` | Aplicar migraciones pendientes |
| `npm run db:seed` | Recrear los negocios del seed |
| `npm run db:reset` | Borrar la base local y volver a migrar y sembrar |
| `npm run db:piloto` | Cargar el negocio piloto Hawken's Food (no lo toca si ya existe) |
| `npm run db:prod:migrate` / `db:prod:status` | Migraciones en Neon (usa `.env.produccion`) |
| `npm run db:prod:piloto` | Cargar el piloto en Neon |
| `npm run prod:smoke` | Prueba de humo contra Neon: menú, cálculo de un pedido y login del dueño |
| `npm run start:prod` | Servidor compilado contra Neon (después de `npm run build`) |

## Estructura

```text
docs/              plan, ADRs y guion de la Fase 0
prisma/            esquema, migraciones (con SQL manual al final) y seed
src/app/           páginas y rutas REST en /api/v1
src/modulos/       reglas de negocio: menu, pedidos, negocio, autenticacion, auditoria
src/lib/           utilidades sin dominio: base, dinero, teléfono, errores, tokens, límites de uso
tests/             unidad, integración y e2e
```

## Producción

Base en Neon (rama `production`, `aws-sa-east-1`) y hosting en Vercel, región `gru1`. Las variables de Neon se bajan con
`neon env pull --file .env.produccion` (archivo fuera de git). En Vercel solo hace falta `DATABASE_URL` (pooled).

## CI

`.github/workflows/ci.yml` corre en cada pull request: `npm audit` de dependencias de producción, tipos, lint,
migraciones y seed sobre un PostgreSQL 17 de servicio, y la suite completa.
