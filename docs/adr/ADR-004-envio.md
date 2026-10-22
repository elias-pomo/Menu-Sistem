# ADR-004: Costo de envío fijo y pedido mínimo

- Estado: aceptada
- Fecha: 22/10/2026
- Decisión del plan: D4 (sección 26 de [PLAN.md](../PLAN.md)), opción A

## Decisión

Cada negocio configura `delivery_fee_cents` y `min_order_cents`. El mínimo se compara contra el subtotal de productos, sin envío.

## Consecuencias

No existe la tabla `delivery_zone` en el MVP. Si el piloto muestra que hace falta, se adelanta RF-040.
