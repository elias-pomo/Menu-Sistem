"use client";

import { useCallback, useSyncExternalStore } from "react";
import { CARRITO_VACIO, leerCarrito, type Carrito } from "./carrito";

/**
 * Carrito guardado en localStorage, compartido entre el menú y la página del carrito (y entre
 * pestañas). En el servidor y en la primera hidratación es el carrito vacío, así no hay diferencias
 * de hidratación; después se lee lo guardado.
 */

const clave = (slug: string) => `carrito:${slug}`;
const oyentes = new Set<() => void>();
const cache = new Map<string, { texto: string | null; carrito: Carrito }>();

function leer(slug: string): Carrito {
  let texto: string | null = null;
  try {
    texto = window.localStorage.getItem(clave(slug));
  } catch {
    // Sin acceso a localStorage (modo privado estricto): el carrito vive solo en memoria.
    return cache.get(slug)?.carrito ?? CARRITO_VACIO;
  }
  const anterior = cache.get(slug);
  if (anterior && anterior.texto === texto) return anterior.carrito;
  const carrito = leerCarrito(texto);
  cache.set(slug, { texto, carrito });
  return carrito;
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  window.addEventListener("storage", oyente);
  return () => {
    oyentes.delete(oyente);
    window.removeEventListener("storage", oyente);
  };
}

export function useCarrito(slug: string) {
  const carrito = useSyncExternalStore(
    suscribir,
    () => leer(slug),
    () => CARRITO_VACIO,
  );

  const guardar = useCallback(
    (cambio: (actual: Carrito) => Carrito) => {
      const nuevo = cambio(leer(slug));
      const texto = JSON.stringify(nuevo);
      cache.set(slug, { texto, carrito: nuevo });
      try {
        if (nuevo.items.length) window.localStorage.setItem(clave(slug), texto);
        else window.localStorage.removeItem(clave(slug));
      } catch {
        // Se queda solo en memoria.
      }
      oyentes.forEach((o) => o());
    },
    [slug],
  );

  return [carrito, guardar] as const;
}
