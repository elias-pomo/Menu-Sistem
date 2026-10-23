@AGENTS.md

# Pedidos para casas de comida — contexto para Claude

Plataforma multi-negocio de menú digital, pedidos y panel para casas de comida de barrio. Cada negocio se
identifica por su `slug` (`/{slug}`).

- Plan funcional y técnico, reglas de negocio y modelo de datos: [docs/PLAN.md](docs/PLAN.md). Es la fuente de verdad.
- Decisiones aprobadas: [docs/adr/](docs/adr/) (ADR-001 a ADR-010, todas la opción A del plan).
- Setup local y scripts: [README.md](README.md).

## Cómo trabajar con el usuario

- Desarrollador freelance en Argentina. Hablarle en **español rioplatense (voseo)**.
- Proponer antes de programar cambios grandes; los chicos, directo.
- Commits en español, solo cuando lo pide. El push a `main` va a desplegar producción.
- Textos de la app en español de Argentina, con voseo ("Elegí", "Confirmá").

## Estado (22/10/2026)

- Fases 1 a 3 hechas: docs y ADRs, proyecto base con CI, esquema y migración, seed, módulos de dinero,
  teléfono, cálculo de pedidos, estados, autenticación, permisos y auditoría, con tests.
- Fase 0 (entrevistas, local piloto, consulta legal) pendiente: la hace el usuario. Guion en `docs/fase-0/`.
- Fase 4 hecha (se adelantó a la 6a porque el menú del piloto ya estaba cargado): menú público `/{slug}`, hoja de
  producto, carrito `/{slug}/carrito` en localStorage y `GET /api/v1/public/{slug}/menu`. El botón "Continuar" del
  carrito queda deshabilitado hasta la Fase 5 (crear pedidos). Sigue la 6a (CRUD de menú y fotos) y después la 5.
- Menú público: `obtenerMenuPublico` (`modulos/menu/publico.ts`) con `"use cache"` y la etiqueta `etiquetaMenu(slug)`;
  todo cambio de menú tiene que llamar a `revalidateTag(etiquetaMenu(slug))`. Abierto/cerrado se calcula en el navegador
  (`useAhora`, sin diferencias de hidratación); el servidor valida al confirmar.
- e2e: `npm run test:e2e` usa la base local con el piloto cargado y fija la hora con `page.clock`. El Fast Refresh a
  veces deja colgada la pestaña del navegador del panel: si una página no se hidrata, probar en una pestaña nueva.
- Piloto: **Hawken's Food** (`/hawkens-food`), local ficticio con el nombre de la marca Hawken y su menú real. Fotos
  genéricas (todavía no cargadas). Se carga con `npm run db:piloto` (local) o `npm run db:prod:piloto` (Neon).

### Infraestructura

- **GitHub:** https://github.com/elias-pomo/Menu-Sistem (rama `main`).
- **Neon:** proyecto `steep-flower-76462263` (org `org-divine-sunset-27667948`), rama `production`, región `aws-sa-east-1`.
  Vinculado con `.neon` y `neon.ts` (solo Postgres). Migración inicial aplicada y piloto cargado.
- **Vercel:** plan **Hobby** hasta el primer cliente que pague (ADR-002); después Pro. Proyecto `ecovex-menu-sistem`
  (scope `elias-projects-51814171`), producción en https://ecovex-menu-sistem.vercel.app, región `gru1`.
  `DATABASE_URL` (pooled, sensible) apunta a la rama `production` de Neon en Production y a una rama de preview
  (`ep-silent-feather`) en Preview. `DATABASE_POOL_MAX=3` en los dos. Si se cambian variables, hace falta un redeploy.
- `.env.preview` (no está en git): conexiones de la rama de preview. Cada migración nueva se aplica también ahí con
  `npm run db:preview:migrate`, antes de mergear a `main`.
- `.env.produccion` (no está en git): variables de Neon (`neon env pull --file .env.produccion`) y el usuario dueño del
  piloto. Lo usan `npm run db:prod:*`, `npm run prod:smoke` y `npm run start:prod`. **No renombrarlo a `.env.production*`**:
  Next lo cargaría solo en el build. El `.env` queda para la base local.
- CLI de Neon: `neon` (instalada global). Skills y MCP de Neon instalados como plugin de Claude Code (scope usuario);
  el MCP pide OAuth con /mcp. Preferir la CLI.

## Reglas del código

- Identificadores en inglés (`Business`, `Order`); carpetas de módulos y textos en español.
- `src/app/api/v1`: rutas finas (validar con Zod, llamar al servicio, responder). Sin reglas de negocio.
- `src/modulos/*`: reglas de negocio. Un módulo importa de otro por su `index.ts`. Excepción: los archivos
  puros que también usa el navegador (`pedidos/calculo`, `pedidos/estados`, `autenticacion/permisos`,
  `negocio/horarios`, `negocio/alcance`) se pueden importar directo, porque el `index.ts` arrastra `server-only`.
- **Multi-negocio:** los repositorios exigen un `NegocioId` (tipo con marca, `negocio/alcance.ts`). Solo sale de la
  sesión (`validarSesion`) o del slug resuelto en el servidor (`obtenerNegocioPorSlug`). Nunca del cuerpo de la solicitud.
  Consultas por ID: siempre con `businessId` en el WHERE; si no coincide, 404 (no 403).
- **Dinero:** enteros en centavos (`lib/dinero.ts`). El servidor recalcula todo con `calcularPedido`; los precios del
  navegador solo sirven para detectar cambios (409 `MENU_CHANGED`).
- **Estados:** solo las transiciones de `pedidos/estados.ts`. Se aplican con `updateMany` filtrando por el estado
  esperado (409 `STATUS_CONFLICT` si otro usuario lo cambió) y cada cambio deja fila en `order_status_history`.
- Autorización del panel: `requerirRol` / `requerirPermiso` (`autenticacion/sesion-actual.ts`) en cada ruta.
- Errores con `AppError` y `respuestaError` (`lib/errores.ts`): formato único de la sección 15 del plan.

## Base de datos y trampas conocidas

- La app usa node-postgres ( + ) con  de , como recomienda
  Neon para Vercel. Migraciones por la conexión directa (), la app por la pooled.
- La app usa node-postgres (`pg.Pool` + `@prisma/adapter-pg`) con `attachDatabasePool` de `@vercel/functions`, como
  recomienda Neon para Vercel. La app va por la conexión pooled (`DATABASE_URL`); migraciones y scripts por la directa
  (`DATABASE_URL_UNPOOLED`).
- **Prisma 7.10**: generator `prisma-client` en `src/generated/prisma`, adapter `@prisma/adapter-pg`, `prisma.config.ts`.
- La migración inicial tiene SQL escrito a mano al final (CHECK, índices parciales y triggers). Una migración ya
  aplicada no se edita: los cambios van en una migración nueva.
- **Prisma borra las FKs que no conoce** en la siguiente migración. Por eso las referencias opcionales al mismo
  negocio (`order_item.product_id`, `order_item_option.option_id`, `customer_order.paid_by`,
  `order_status_history.user_id`, `audit_log.user_id`) se validan con el trigger `assert_same_business_ref`, no con FKs.
  Antes de crear una migración nueva, revisar que no traiga `DROP` inesperados.
- `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` debe dar migración vacía.
- `prisma migrate reset` y `migrate dev` pueden quedar esperando confirmación: correrlos en una terminal interactiva.
- Local con `prisma dev` (PGlite): `DATABASE_POOL_MAX=1` y `SHADOW_DATABASE_URL` aparte.
- El seed corre con `tsx --conditions=react-server` para que `server-only` no falle fuera de Next.
- Next.js 16 con `cacheComponents`: los datos de runtime van dentro de `<Suspense>` o después de `connection()`.
  Leer `node_modules/next/dist/docs/` antes de usar APIs que no conozcas.
- Inputs a 16 px (iOS no hace zoom). `localStorage` solo dentro de efectos.
