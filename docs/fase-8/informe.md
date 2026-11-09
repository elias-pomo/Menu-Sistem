# Fase 8: informe de pruebas y de seguridad

Fecha: 08/11/2026. Alcance: la Fase 8 de `docs/PLAN.md`, sección 20. Comprende la suite completa, la accesibilidad, el rendimiento, la revisión OWASP, los intentos manuales de T1 a T4, las cabeceras y la CSP, `npm audit` y la rotación de secretos.

## Resumen

| Tema | Resultado |
| --- | --- |
| Suite | 502 tests de unidad e integración y 33 e2e en verde; `tsc` y ESLint limpios |
| `npm audit` (producción) | 0 vulnerabilidades. Antes había 5 altas; ver H-01 |
| Cabeceras y CSP | CSP en toda la app, COOP y sin `X-Powered-By`; ver H-02 |
| Intentos T1 a T5 | Ninguno logró leer ni cambiar datos ajenos, saltear un rol o cobrar menos; ver la sección de amenazas |
| Accesibilidad (axe, WCAG 2.1 A y AA) | 0 problemas en 12 pantallas. Antes había 4 tipos; ver H-04 |
| Rendimiento | LCP del menú de 1,5 a 2,3 s en Slow 4G (local). En producción era de 2,7 s por fotos sin achicar; ver H-05 |
| Hallazgos | 7 cerrados, 4 aceptados o pasados a otra fase y 1 en parte (la rotación de secretos: falta el token de Blob) |

## Hallazgos

| # | Hallazgo | Severidad | Estado |
| --- | --- | --- | --- |
| H-01 | `npm audit`: `@vercel/blob` y `@vercel/functions` traían `zod@4.1.11` (GHSA-mrhx-c7xc-m3w5, consumo de memoria) a través de `@vercel/oidc` y `@vercel/cli-config` | Alta | Cerrado: `@vercel/functions` pasó a 3.11 y hay un `overrides` que obliga a `@vercel/cli-config` a usar el `zod` del proyecto. El CI corre `npm audit --audit-level=high --omit=dev`, así que estaba fallando por esto |
| H-02 | Sin `Content-Security-Policy` en la app (solo en `/sw.js`) y con `X-Powered-By: Next.js` | Media | Cerrado: CSP en `next.config.ts` (abajo el detalle), `Cross-Origin-Opener-Policy: same-origin` y `poweredByHeader: false` |
| H-03 | El seguimiento `/public/{slug}/orders/{token}` no tenía límite por IP (sección 15: 30/min; T4) | Baja: el token es de 128 bits | Cerrado: solo cuentan los fallos. Después de 30 tokens inexistentes en un minuto, la IP recibe 429. El refresco de un pedido real no suma consultas. Lo cubren un test de integración y otro e2e |
| H-04 | Accesibilidad: <br>• contraste de las etiquetas del producto (color del local sobre su mismo tono) <br>• tarjetas agotadas al 60 % de opacidad <br>• `text-stone-400` en el panel <br>• `aria-label` sin rol en el esqueleto de carga del menú <br>• el nombre accesible de la tarjeta ("Agregar X") no incluía su texto visible (WCAG 2.5.3) | Media | Cerrado: <br>• etiquetas en `stone-800` <br>• agotado con fondo gris y foto en escala de grises, sin opacidad <br>• `stone-500` en el panel <br>• esqueleto con `role="status"` <br>• el botón es el "+" y su área cubre toda la tarjeta |
| H-05 | Las fotos se servían en tamaño original (hasta 1600 px y 180 KB) para un cuadrado de 96 px: el menú del piloto en producción bajaba 814 KB y su LCP era de 2,74 s | Media | Cerrado: `next/image` con `remotePatterns` del Blob y 1x/2x. Una foto bajó de unos 100 KB a 9 KB |
| H-06 | Zod llegaba al navegador del panel solo por la lista de motivos de cancelación. Al cargar, prueba `new Function`, que la CSP bloquea y reporta | Baja | Cerrado: la lista está en `pedidos/motivos.ts`, sin zod. El panel deja de cargar zod y libphonenumber |
| H-07 | El refresco del panel (cada 5 a 10 s) filtra por `updated_at` sin índice. El detalle del pedido busca en `audit_log` por entidad sin índice | Baja hoy; crece con el volumen | Cerrado: migración `20261109004500_indices_refresco_y_auditoria`, con `(business_id, updated_at)` y `(business_id, entity_type, entity_id)` |
| H-08 | La CSP lleva `'unsafe-inline'` en `script-src` (el plan pedía nonce) | Baja | Aceptado: el nonce obliga a renderizar todo por solicitud y es incompatible con el prerender parcial del menú. Mitigación: React escapa todo, no hay `dangerouslySetInnerHTML` y los enlaces `wa.me` se arman con `encodeURIComponent`. Alternativa futura: SRI experimental de Next |
| H-09 | Sin límite por IP en `GET /public/{slug}/menu` (sección 15: 60/min) | Baja | Aceptado: responde desde la caché de Vercel (`s-maxage=60`) y casi no toca la base. Al pasar a Pro, sumar una regla en el firewall de Vercel |
| H-10 | Las fotos no se vuelven a codificar en el servidor: llegan ya comprimidas a WebP desde el navegador (ADR-006). Una subida directa a la API podría conservar metadatos EXIF | Baja: solo encargado o dueño y del propio local | Aceptado: se verifica el tipo por contenido, el tamaño y la carpeta del negocio. Si se suman fotos de terceros, recodificar con sharp |
| H-11 | `npm audit` de desarrollo: 8 moderadas (`minimatch` vía `typescript-eslint`) | Baja: solo en desarrollo | Aceptado hasta que `eslint-config-next` actualice |
| H-12 | Secretos: el token de Vercel Blob que se filtró sigue vigente y la contraseña de Neon no se cambió desde que el repositorio es público | Alta | **En parte**: la contraseña de `neondb_owner` se rotó el 08/11 en las ramas `production` y `preview`, con Vercel y los `.env` actualizados y redeploy verificado. Falta revocar el token de Blob y pasar el repositorio a privado |

## CSP

Va en `next.config.ts`, para todas las rutas:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' blob: data: https://*.public.blob.vercel-storage.com; font-src 'self';
connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-src 'none'; object-src 'none';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

- En desarrollo agrega `'unsafe-eval'`, que necesita React. En las previews de Vercel habilita `https://vercel.live`, que es su barra de comentarios.
- `style-src 'unsafe-inline'` hace falta por los atributos `style` del color del local y de las barras de métricas.
- `tests/e2e/calidad.spec.ts` recorre el cliente y el panel y falla ante cualquier violación de CSP.

## Amenazas (sección 18): intentos manuales

Están en `tests/e2e/ataques.spec.ts` y van contra la API real, con cookie y control de origen.

| Amenaza | Intento | Resultado |
| --- | --- | --- |
| T1: ver datos de otro negocio | Un dueño de la-esquina prueba 14 rutas por ID con datos de don-pepe: pedido (ver, cambiar estado, cancelar, cobrar, WhatsApp), producto (ver, editar, agotar, borrar), categoría, grupo de opciones y usuario (desactivar, nueva contraseña). También reordenar con un ID ajeno, mandar `businessId` en el cuerpo y revisar las listas | 404 en las 14 rutas, sin el nombre del otro local en la respuesta. Las filas de don-pepe quedan idénticas. Un campo desconocido da 400. Ninguna lista trae IDs ajenos |
| Roles | El personal pide usuarios, historial, métricas y crear una categoría | 403 |
| CSRF | Escritura con sesión válida desde otro origen, sin `Origin` o con un cuerpo que no es JSON | 403, 403 y 400 |
| Sesión | Sin cookie o con una cookie inventada | 401, sin trazas internas |
| T2: pedidos masivos | 12 pedidos desde la misma IP en un minuto | 429 al pasar los 10 por minuto |
| T3: manipular precios | Precio de $ 1 en `expectedUnitCents` | 409 `MENU_CHANGED`, sin pedido. Sin precio, el total guardado es el del menú |
| T4: enumerar pedidos | Token de un local con el slug de otro; código corto en lugar del token; 32 tokens al azar | 404, 404, y después 429 en el 31.º fallo |
| T5: fuerza bruta | 6 logins fallidos seguidos | 429, aun con la contraseña correcta, y mensaje genérico |

Además, los tests de integración de aislamiento comprueban que la base rechace referencias cruzadas aunque el código fallara (FKs compuestas y triggers).

## Revisión OWASP (sección 17)

| Control | Estado |
| --- | --- |
| Autenticación y hash | Argon2id, mínimo de 10 caracteres, lista de comunes, 5 intentos por email y por IP cada 15 min, mensaje genérico |
| Sesiones | Token aleatorio, hash en la base, cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax` y 14 días. Desactivar un usuario o cambiarle el rol cierra sus sesiones |
| Autorización | `requerirRol` o `requerirPermiso` en cada ruta del panel; matriz de permisos con tests |
| Aislamiento e IDOR | `NegocioId` con marca de tipo, `businessId` en cada WHERE, 404 uniforme, FKs compuestas y triggers |
| Validación | Zod con `.strict()` en cada cuerpo; límites de largo |
| Inyección SQL | Solo Prisma y `$queryRaw` con plantillas. No hay `$queryRawUnsafe` |
| XSS | Sin `dangerouslySetInnerHTML`, React escapa y hay CSP (H-08) |
| CSRF y CORS | `Origin` verificado en cada escritura, solo JSON, `SameSite=Lax` y sin CORS |
| Límites | Login, pedidos por IP y por celular, y seguimiento por IP (H-03) |
| Errores | Formato único, sin trazas; el detalle va a los logs con `requestId` |
| Logs | Sin teléfonos ni direcciones. Los avisos push registran solo el negocio, el tag y los conteos |
| Dependencias | `npm audit` en el CI (H-01) |
| Fotos | Tipo por contenido, ≤ 5 MB y carpeta del negocio (H-10) |

`X-Forwarded-For`: Vercel lo reemplaza con la IP real del visitante, así que en producción no se puede falsificar para esquivar los límites. Los e2e locales lo mandan a mano para simular distintas IP.

## Accesibilidad

`tests/e2e/calidad.spec.ts` corre axe con las reglas WCAG 2.0 y 2.1 A y AA en 12 pantallas:

- Cliente: menú, hoja de producto, carrito, confirmar y seguimiento.
- Panel: ingreso, menú, pedidos, ajustes, usuarios, historial y métricas.

Queda en 0 problemas. Durante la suite apareció otro problema: `pedido.spec.ts` dependía de la hora real, porque el menú queda en caché con los horarios reales. Ahora fija la hora del navegador, como el resto. Los anchos de 360 a 1440 px, el scroll horizontal y los objetivos táctiles de 44 px ya estaban cubiertos por `menu-publico.spec.ts` (CA-09).

## Rendimiento

La medición se hizo con Playwright, con la misma emulación que Lighthouse para celular: Slow 4G (150 ms de latencia, 1,6 Mbps) y CPU 4 veces más lenta. Es la mediana de 3 cargas a 390 px. Lighthouse no logró grabar la traza en esta máquina (`NO_NAVSTART`, con Chrome y con Chromium).

| Página | LCP | FCP | CLS | Transferido |
| --- | --- | --- | --- | --- |
| `/hawkens-food` (build local, sin fotos) | 1,48 s | 1,48 s | 0,087 | 176 KB (158 KB de JS) |
| `/la-esquina` (build local) | 2,28 s | 1,26 s | 0,086 | 177 KB |
| `/admin/ingresar` (build local) | 0,83 s | 0,83 s | 0 | 157 KB |
| `/hawkens-food` en producción, **antes** de H-05 | 2,74 s | 0,99 s | 0,087 | 814 KB |

Objetivo RNF-001: LCP ≤ 2,5 s en Slow 4G. Después de desplegar H-05 hay que volver a medir producción con fotos. El CLS está por debajo de 0,1, pero cerca: lo causa el estado abierto/cerrado, que se calcula en el navegador.

## Criterios de aceptación

| Criterio | Estado |
| --- | --- |
| CA-01: pedido en menos de 90 s desde un celular | Falta la prueba con un usuario real (Fase 9) |
| CA-02: pedido nuevo en ≤ 10 s con sonido | e2e `pedido.spec.ts` (≤ 10 s). El sonido se probó a mano en Android |
| CA-03: total guardado igual al calculado | Unitarias de cálculo, integración de creación y T3 |
| CA-04: aislamiento | Integración de aislamiento y T1 |
| CA-05: historial de transiciones | Unitarias de estados e integración de pedidos |
| CA-06: cambiar un precio no cambia pedidos existentes | Integración (histórico fiel del pedido) |
| CA-07: doble toque crea un solo pedido | e2e con `dblclick` e idempotencia en integración |
| CA-08: restauración de un volcado en menos de 4 h | Pasa a la Fase 9, junto con los backups. Esta máquina no tiene `pg_dump` |
| CA-09: sin scroll horizontal, objetivos de 44 px | e2e en 5 anchos más la revisión del panel a 375 px |

## Rotación de secretos

| Secreto | Dónde | Qué hacer |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` (filtrado) | Solo `.env` local; en Vercel se usa OIDC | Revocarlo en Vercel → Storage → el store → Settings, crear uno nuevo y ponerlo en `.env` |
| Contraseña del rol de Neon | `DATABASE_URL` en Vercel (Production y Preview), `.env.produccion` y `.env.preview` | **Hecho (08/11)**: reset con la API de Neon (la CLI no tiene el comando) en las dos ramas, variables actualizadas y redeploy de producción con `/api/v1/health` en `ok` |
| Claves VAPID, `SEED_PASSWORD` y contraseña del dueño del piloto | Vercel y `.env*` | No se filtraron; no hace falta rotarlas |
| Repositorio público | GitHub | Pasarlo a privado |
