# ADR-003: Efectivo y transferencia con marca manual de cobrado

- Estado: aceptada
- Fecha: 22/10/2026
- Decisión del plan: D3 (sección 26 de [PLAN.md](../PLAN.md)), opción A

## Decisión

El MVP no integra pasarela de pago. El cliente elige efectivo (con "pago con") o transferencia (se muestra alias y titular). El personal marca el pedido como cobrado (`paid_at`, `paid_by`).

## Consecuencias

Sin webhooks ni conciliación. Mercado Pago queda como funcionalidad avanzada.
