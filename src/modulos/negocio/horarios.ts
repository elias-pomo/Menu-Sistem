import { TZDate } from "@date-fns/tz";

/**
 * Horarios de atención (RN-10). Cada franja es un día de la semana con apertura y cierre en minutos
 * desde la medianoche, en la hora local del negocio. Si el cierre es menor o igual a la apertura, la
 * franja cruza la medianoche y termina al día siguiente. Varias franjas por día = turno cortado.
 */

export type Franja = { weekday: number; opensMin: number; closesMin: number };

export type EstadoApertura =
  | { abierto: true }
  | { abierto: false; motivo: "PAUSADO" | "FUERA_DE_HORARIO" };

const MINUTOS_DIA = 24 * 60;

/** Día de la semana (0 = domingo) y minuto del día en la zona horaria del negocio. */
export function horaLocal(ahora: Date, zonaHoraria: string) {
  const local = new TZDate(ahora.getTime(), zonaHoraria);
  return { weekday: local.getDay(), minuto: local.getHours() * 60 + local.getMinutes() };
}

export function estaEnHorario(franjas: readonly Franja[], ahora: Date, zonaHoraria: string): boolean {
  const { weekday, minuto } = horaLocal(ahora, zonaHoraria);
  const ayer = (weekday + 6) % 7;

  return franjas.some((f) => {
    const cruzaMedianoche = f.closesMin <= f.opensMin;
    if (f.weekday === weekday) {
      return cruzaMedianoche ? minuto >= f.opensMin : minuto >= f.opensMin && minuto < f.closesMin;
    }
    // La parte de después de la medianoche de una franja que empezó ayer.
    return f.weekday === ayer && cruzaMedianoche && minuto < f.closesMin;
  });
}

export function estadoApertura(
  negocio: { acceptingOrders: boolean; timezone: string },
  franjas: readonly Franja[],
  ahora = new Date(),
): EstadoApertura {
  if (!negocio.acceptingOrders) return { abierto: false, motivo: "PAUSADO" };
  return estaEnHorario(franjas, ahora, negocio.timezone) ? { abierto: true } : { abierto: false, motivo: "FUERA_DE_HORARIO" };
}

/** "HH:MM" a minutos desde la medianoche, o null si no es una hora válida. */
export function horaAMinutos(hora: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hora);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function minutosAHora(minutos: number): string {
  const normalizado = ((minutos % MINUTOS_DIA) + MINUTOS_DIA) % MINUTOS_DIA;
  return `${String(Math.floor(normalizado / 60)).padStart(2, "0")}:${String(normalizado % 60).padStart(2, "0")}`;
}

/** Fecha del negocio (AAAA-MM-DD) en su zona horaria: el día al que pertenece un pedido. */
export function fechaDeNegocio(ahora: Date, zonaHoraria: string): string {
  const local = new TZDate(ahora.getTime(), zonaHoraria);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}
