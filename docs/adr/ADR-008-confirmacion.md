# ADR-008: Confirmación manual con opción automática por negocio

- Estado: aceptada
- Fecha: 22/10/2026
- Decisión del plan: D8 (sección 26 de [PLAN.md](../PLAN.md)), opción A

## Decisión

Todo pedido nace PENDING y el local lo confirma. Si el negocio activa `auto_confirm`, el pedido nace CONFIRMED y la transición queda en el historial como hecha por el sistema.

## Consecuencias

Un caso de prueba más en la máquina de estados.
