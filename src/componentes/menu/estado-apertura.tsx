"use client";

import { estadoApertura, horaLocal, minutosAHora } from "@/modulos/negocio/horarios";
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

export function EstadoApertura({ negocio }: { negocio: NegocioPublico }) {
  const estado = useApertura(negocio);
  const ahora = useAhora();

  if (!estado || !ahora) {
    return <span className="inline-block h-7 w-36 animate-pulse rounded-full bg-stone-200" aria-hidden />;
  }
  if (estado.abierto) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
        <span className="size-2 rounded-full bg-emerald-600" aria-hidden />
        Abierto: tomando pedidos
      </span>
    );
  }
  const texto = estado.motivo === "PAUSADO" ? "Pedidos pausados" : "Cerrado";
  const apertura = estado.motivo === "FUERA_DE_HORARIO" ? proximaApertura(negocio, ahora) : null;
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-sm font-medium text-stone-700">
      <span className="size-2 rounded-full bg-stone-500" aria-hidden />
      {texto}
      {apertura && <span className="font-normal">· {apertura}</span>}
    </span>
  );
}
