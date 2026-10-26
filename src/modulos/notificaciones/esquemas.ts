import { z } from "zod";

/** Suscripción tal como la serializa `PushSubscription.toJSON()` en el navegador. */
export const Suscripcion = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});
export type SuscripcionDatos = z.infer<typeof Suscripcion>;

export const Baja = z.object({ endpoint: z.url({ protocol: /^https$/ }).max(1000) });
