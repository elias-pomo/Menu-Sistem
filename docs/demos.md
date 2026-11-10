# Negocios demo: qué tienen y cómo probarlos

Hay tres locales ficticios para probar el sistema de punta a punta. Se cargan con `npm run db:demos` (base local) y `npm run db:prod:demos` (producción).

| Local | Menú | Panel |
| --- | --- | --- |
| Pizzería La Fugazza | `/demo-pizzeria` | `dueno@demo-pizzeria.test` |
| Restó Los Arrayanes | `/demo-resto` | `dueno@demo-resto.test` |
| Café Alma | `/demo-cafe` | `dueno@demo-cafe.test` |

**Usuarios.** Cada local tiene tres usuarios con la misma contraseña, `DEMO_PASSWORD`, que está en `.env` y en `.env.produccion`:

- `dueno@<slug>.test`: dueño
- `encargado@<slug>.test`: encargado
- `personal@<slug>.test`: personal

**Pedidos cargados.** Cada local trae unos 55 pedidos de los últimos 30 días, dentro de su horario: casi todos entregados y algunos cancelados con distintos motivos. Además tiene un pedido por cada columna del panel. Esos pedidos "de hoy" se crean con la hora en que se corre el script.

**Volver a empezar.** `npm run db:demos -- --reset` (o `db:prod:demos -- --reset`) borra solo los demos y los crea de nuevo, con pedidos nuevos.

## Qué tiene cada uno

| | Pizzería | Restó | Café |
| --- | --- | --- | --- |
| Horario | Mar a jue 19:30–00:30; vie y sáb 19:30–02:00; dom 19:30–00:00; **lunes cerrado** | Mediodía de lun a sáb 12:00–15:30 y dom 12:00–16:00; **noche de mar a sáb** 20:00–00:00 | Lun a sáb 7:30–20:30 corrido; dom 8:30–13:00 |
| Entrega | Delivery $ 2.000, **mínimo $ 15.000** | Delivery $ 2.500, mínimo $ 10.000 | **Delivery gratis**, mínimo $ 12.000 |
| Pago | Efectivo y transferencia | Efectivo y transferencia | Efectivo y transferencia |
| Opciones | Tamaño obligatorio; **media y media: exactamente 2 gustos**, los especiales suman; adicionales (hasta 3); cocción de empanadas; sin ingredientes | Guarnición obligatoria; punto de la carne; salsa con adicional; extras; sin sal, cebolla, ajo o picante | Tamaño y **tipo de leche** con adicional; **facturas: hasta 3 variedades**; porción o **torta entera** (+$ 32.000) |
| Casos especiales | Agotada: Rúcula y crudo. Oculta: Empanada de verdura. Opciones no disponibles: Rúcula y Palmitos | Agotado: Salmón. Oculto: Menú ejecutivo. Opción no disponible: Vegetales grillados | Agotado: Lemon pie. Oculta: Rosca de Pascua. Opción no disponible: Sacramentos |
| Aspecto | Rojo oscuro, con descripciones | Verde, con descripciones; aviso de demora a los 10 min | **Amarillo claro**: el texto de los botones pasa a oscuro. **Sin descripciones** |
| Platos y bebidas | 23 platos y 6 bebidas | 21 platos y 7 bebidas | 22 productos de desayuno, panadería, pastelería y salado, y 10 bebidas |

## Recorrido de prueba

### Cliente, desde el celular
1. **Pizzería, de noche:** armá una media y media.
   - Con un solo gusto no te deja agregarla, y con 2 sí.
   - Un especial suma el adicional.
2. **Pizzería, mínimo de compra:** con una sola muzzarella mediana en delivery, el carrito avisa cuánto falta para el mínimo. Sumá empanadas (por ejemplo, 6 de carne fritas) hasta pasarlo.
3. **Pizzería, pasada la medianoche:** entrá el sábado a la 1:30 y tiene que estar abierta. El lunes a cualquier hora, cerrada.
4. **Restó, entre turnos:** entrá un martes a las 17:00. Tiene que decir que abre a las 20:00 y el menú queda en lectura. El lunes a la noche, cerrado.
5. **Restó, plato con opciones:** pedí un bife de chorizo. Te tiene que pedir el punto y la guarnición; las papas españolas suman $ 1.500.
6. **Café, facturas:** en la docena surtida, después de 3 variedades no te deja elegir más.
7. **Café, torta entera:** en el cheesecake elegí "Torta entera" y mirá cómo cambia el precio.
8. **Café, envío gratis:** en delivery, el envío figura en $ 0.
9. **Agotados y ocultos:** el producto agotado se ve gris y no se puede pedir. El oculto no aparece.
10. **Seguimiento:** confirmá un pedido y dejá abierto el link de seguimiento.

### Panel, desde la PWA o el navegador
1. Con el **personal**:
   - Confirmá el pedido nuevo con minutos y mandá el WhatsApp (sale "Mensaje preparado").
   - Avanzalo hasta entregado y marcalo cobrado.
   - En el seguimiento del cliente se ve cada cambio en 15 s o menos.
2. **Pausa:** pausá los pedidos con un mensaje. El menú público lo muestra y no deja confirmar.
3. **Agotado en un toque:** marcá un producto como agotado desde Menú y fijate que el menú público lo refleje.
4. Con el **encargado**: Métricas con "Este mes", ranking de productos, horas pico y retiro contra delivery.
5. Con el **dueño**:
   - Ajustes, Envío y pagos: cambiá el mínimo o el envío y fijate que el carrito lo tome.
   - Usuarios: creá uno nuevo y probá su contraseña temporal.
   - Historial: tienen que aparecer los cambios que hiciste.
6. **Permisos:** con el personal no se ven Métricas ni las acciones de edición del menú.
7. **Avisos push:** con la PWA instalada y "Avisos activados", hacé un pedido desde otro celular y tiene que llegar la notificación.

## Notas

- Los nombres, celulares y direcciones de los pedidos son inventados. No mandes el WhatsApp a esos números.
- Los pedidos de prueba que hagas quedan en las métricas. Si molestan, se limpian con `--reset`.
