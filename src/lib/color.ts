/**
 * Contraste WCAG para el color principal que elige cada negocio: el texto sobre ese color se elige
 * solo (blanco o casi negro), así un color claro no deja botones ilegibles (sección 10 del plan).
 */

const OSCURO = "#1c1917";
const CLARO = "#ffffff";

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function esColorValido(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

/** Color de texto con mejor contraste sobre `fondo`. */
export function textoSobre(fondo: string): string {
  if (!esColorValido(fondo)) return CLARO;
  return contraste(fondo, CLARO) >= contraste(fondo, OSCURO) ? CLARO : OSCURO;
}
