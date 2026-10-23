"use client";

import { useSyncExternalStore } from "react";

/**
 * Minuto actual en el navegador, actualizado cada 30 s. En el servidor es null: lo que depende de la
 * hora (abierto/cerrado) se muestra recién en el cliente, sin diferencias de hidratación.
 */
function suscribir(aviso: () => void) {
  const intervalo = window.setInterval(aviso, 30_000);
  document.addEventListener("visibilitychange", aviso);
  return () => {
    window.clearInterval(intervalo);
    document.removeEventListener("visibilitychange", aviso);
  };
}

const minutoActual = () => Math.floor(Date.now() / 60_000);

export function useAhora(): Date | null {
  const minuto = useSyncExternalStore(suscribir, minutoActual, () => null);
  return minuto === null ? null : new Date(minuto * 60_000);
}
