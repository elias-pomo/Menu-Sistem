"use client";

import { useSyncExternalStore } from "react";

const sinSuscripcion = () => () => {};

/**
 * true recién cuando React tomó el control de la página. Sirve para no habilitar un formulario
 * antes de tiempo: un envío nativo previo a la hidratación recargaría la página con los datos.
 */
export function useHidratado(): boolean {
  return useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  );
}
