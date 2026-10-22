# ADR-002: Vercel en la región gru1 (Hobby hasta el primer cliente, después Pro)

- Estado: aceptada (modificada el 22/10/2026)
- Fecha: 22/10/2026
- Decisión del plan: D2 (sección 26 de [PLAN.md](../PLAN.md)), opción A con una etapa previa

## Decisión

Hosting en Vercel, región `gru1`, con la base de Neon en `aws-sa-east-1`. Push a `main` despliega; cada rama genera un preview.

- **Hasta el primer cliente que pague:** plan Hobby (gratis). El piloto es un local ficticio (Hawken's Food) usado como demo.
- **Con el primer cliente real:** pasar a Vercel Pro (USD 20 por mes) antes de que opere, porque Hobby no permite uso comercial.

## Consecuencias

Se puede usar `"use cache"` con `cacheTag` para el menú público en los dos planes. En Hobby no hay cron jobs y los límites de invocaciones y de duración son menores: el polling del panel (ADR-005) hay que medirlo antes de un cliente real. Pasar a Pro es un cambio de plan en el mismo proyecto, sin migración.
