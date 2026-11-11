"use client";

import { cierreActual, estadoApertura, horaLocal, minutosAHora } from "@/modulos/negocio/horarios";
import type { NegocioPublico } from "@/modulos/menu/tipos";
import { useAhora } from "./use-ahora";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Abierto, cerrado o pausado (RF-001). Se calcula en el navegador; el servidor vuelve a validar al pedir. */
export function useApertura(negocio: NegocioPublico) {
  const ahora = useAhora();
  if (!ahora) return null;
  return estadoApertura(negocio, negocio.openingHours, ahora);
}

/** Próxima apertura en texto: "Abre hoy a las 19:00" o "Abre el lunes a las 11:00". */
export function proximaApertura(negocio: NegocioPublico, ahora: Date): string | null {
  const { weekday, minuto } = horaLocal(ahora, negocio.timezone);
  for (let dias = 0; dias < 7; dias++) {
    const dia = (weekday + dias) % 7;
    const franjas = negocio.openingHours
      .filter((f) => f.weekday === dia && (dias > 0 || f.opensMin > minuto))
      .sort((a, b) => a.opensMin - b.opensMin);
    if (franjas.length) {
      const cuando = dias === 0 ? "hoy" : dias === 1 ? "mañana" : `el ${DIAS[dia]}`;
      return `Abre ${cuando} a las ${minutosAHora(franjas[0].opensMin)}`;
    }
  }
  return null;
}

/** "Abierto · cierra a las 00:30", "Cerrado · Abre hoy a las 19:30" o "Pedidos pausados". */
export function EstadoApertura({ negocio }: { negocio: NegocioPublico }) {
  const estado = useApertura(negocio);
  const ahora = useAhora();

  // Hasta saber la hora (primera hidratación), un espacio del mismo alto: nada salta después.
  if (!estado || !ahora) return <span className="inline-block h-5 w-40 rounded-full bg-realce" aria-hidden />;

  if (estado.abierto) {
    const cierre = cierreActual(negocio.openingHours, ahora, negocio.timezone);
    return (
      <span className="inline-flex items-center gap-2">
        <span className="relative grid size-2 place-items-center" aria-hidden>
          <span className="absolute size-2 rounded-full bg-emerald-500 motion-safe:animate-[anillo_2.4s_ease-out_infinite] [--primary:#10b981]" />
          <span className="size-2 rounded-full bg-emerald-500" />
        </span>
        <span className="font-medium text-tinta">Abierto</span>
        {cierre !== null && <span className="text-tinta-suave">· cierra a las {minutosAHora(cierre)}</span>}
      </span>
    );
  }
  const apertura = estado.motivo === "FUERA_DE_HORARIO" ? proximaApertura(negocio, ahora) : null;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-2 rounded-full bg-tinta-suave" aria-hidden />
      <span className="font-medium text-tinta">{estado.motivo === "PAUSADO" ? "Pedidos pausados" : "Cerrado"}</span>
      {apertura && <span className="text-tinta-suave">· {apertura}</span>}
    </span>
  );
}
