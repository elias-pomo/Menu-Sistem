# ADR-001: Plataforma multi-negocio desde el MVP

- Estado: aceptada
- Fecha: 22/10/2026
- Decisión del plan: D1 (sección 26 de [PLAN.md](../PLAN.md)), opción A

## Decisión

Una sola base y una sola aplicación para todos los negocios, cada uno identificado por `slug`. Toda tabla del negocio lleva `business_id` no nulo; la capa de repositorio lo exige como parámetro; las tablas hijas usan claves foráneas compuestas `(business_id, parent_id)`; las consultas por ID devuelven 404 si el negocio no coincide. Al inicio opera un solo negocio.

## Consecuencias

Cada cliente nuevo es un registro y un usuario, no un despliegue. Costo: ~8 a 10 h más de desarrollo y una suite de tests de aislamiento obligatoria en CI. RLS de PostgreSQL queda para la fase de endurecimiento.
