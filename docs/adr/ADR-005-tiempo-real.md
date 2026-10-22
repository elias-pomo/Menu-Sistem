# ADR-005: Polling cada 5 s más push y sonido

- Estado: aceptada
- Fecha: 22/10/2026
- Decisión del plan: D5 (sección 26 de [PLAN.md](../PLAN.md)), opción A

## Decisión

El panel consulta `GET /api/v1/admin/orders?since=<cursor>` cada 5 s mientras la pestaña está visible (10 s si no hay pedidos activos). Los pedidos nuevos disparan sonido y notificación push con `web-push`.

## Consecuencias

Sin proveedor extra. Hay que medir la cuota de invocaciones antes del segundo cliente.
