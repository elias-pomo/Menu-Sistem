# ADR-006: Fotos en Vercel Blob

- Estado: aceptada
- Fecha: 22/10/2026
- Decisión del plan: D6 (sección 26 de [PLAN.md](../PLAN.md)), opción A

## Decisión

El navegador comprime a WebP (lado mayor ≤ 1600 px); el servidor emite la autorización de subida para el negocio de la sesión, valida tipo por contenido y tamaño (≤ 5 MB) y guarda solo la URL.

## Consecuencias

Atado a Vercel. Cloudflare R2 queda como alternativa si cambia el hosting.
