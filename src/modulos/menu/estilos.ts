/**
 * Estilos visuales del menú público. Archivo puro: lo usan el menú, los Ajustes del panel y la
 * validación. Cada estilo define tipografía, fondo y forma de las tarjetas; el color lo pone el local.
 */
export const ESTILOS_MENU = ["NOCTURNO", "MANTEL", "MOSTRADOR"] as const;
export type EstiloMenu = (typeof ESTILOS_MENU)[number];

export const DESCRIPCION_ESTILO: Record<EstiloMenu, { nombre: string; para: string }> = {
  NOCTURNO: { nombre: "Nocturno", para: "Fondo oscuro y letra condensada. Para pizzerías, hamburgueserías y bares." },
  MANTEL: { nombre: "Mantel", para: "Papel claro y letra clásica, como una carta impresa. Para restaurantes." },
  MOSTRADOR: { nombre: "Mostrador", para: "Cálido y redondeado, con productos en grilla. Para cafeterías y panaderías." },
};
