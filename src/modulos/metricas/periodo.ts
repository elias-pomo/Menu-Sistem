/**
 * Período de las métricas: fechas del negocio (AAAA-MM-DD) con los dos extremos incluidos, hasta
 * 366 días (sección 15 del plan). Archivo puro: el panel arma los atajos con las mismas funciones.
 */

export const MAX_DIAS = 366;
const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

const aFecha = (texto: string) => new Date(`${texto}T00:00:00Z`);
const aTexto = (fecha: Date) => fecha.toISOString().slice(0, 10);

export function sumarDias(texto: string, dias: number): string {
  const fecha = aFecha(texto);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return aTexto(fecha);
}

export type Periodo = { desde: string; hasta: string };

/** Valida el período. Devuelve el mensaje de error, o null si es válido. */
export function problemaConPeriodo(desde: string | null, hasta: string | null): string | null {
  if (!desde || !hasta || !FORMATO.test(desde) || !FORMATO.test(hasta)) return "Elegí las fechas del período.";
  const d = aFecha(desde);
  const h = aFecha(hasta);
  if (Number.isNaN(d.getTime()) || Number.isNaN(h.getTime()) || aTexto(d) !== desde || aTexto(h) !== hasta) return "Alguna de las fechas no existe.";
  if (h < d) return "La fecha final tiene que ser igual o posterior a la inicial.";
  if (diasDelPeriodo({ desde, hasta }) > MAX_DIAS) return `El período puede tener hasta ${MAX_DIAS} días.`;
  return null;
}

export function diasDelPeriodo({ desde, hasta }: Periodo): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000) + 1;
}

export type Atajo = "hoy" | "ayer" | "7dias" | "mes" | "mesPasado";

/** Atajos a partir de la fecha de hoy del negocio. */
export function periodoDeAtajo(atajo: Atajo, hoy: string): Periodo {
  const [anio, mes] = hoy.split("-").map(Number);
  const primeroDelMes = `${hoy.slice(0, 7)}-01`;
  switch (atajo) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "ayer":
      return { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1) };
    case "7dias":
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case "mes":
      return { desde: primeroDelMes, hasta: hoy };
    case "mesPasado": {
      const inicio = mes === 1 ? `${anio - 1}-12-01` : `${anio}-${String(mes - 1).padStart(2, "0")}-01`;
      return { desde: inicio, hasta: sumarDias(primeroDelMes, -1) };
    }
  }
}
