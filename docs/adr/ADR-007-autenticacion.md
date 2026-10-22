# ADR-007: Sesión propia con cookie opaca y Argon2id

- Estado: aceptada
- Fecha: 22/10/2026
- Decisión del plan: D7 (sección 26 de [PLAN.md](../PLAN.md)), opción A

## Decisión

Login con email y contraseña. Contraseñas con Argon2id (`@node-rs/argon2`). La sesión es un token aleatorio de 256 bits en una cookie `HttpOnly`, `Secure`, `SameSite=Lax` con prefijo `__Host-` en producción; en la base se guarda solo su hash SHA-256 (tabla `session`). Vencimiento de 14 días con renovación. Límite de 5 intentos fallidos por email y por IP cada 15 min.

## Consecuencias

Distinto de Agendapp (JWT firmado): con la sesión en la base, desactivar un usuario o cambiar la contraseña cierra sus sesiones de inmediato.
