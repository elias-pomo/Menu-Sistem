/**
 * Imágenes de productos (RNF-012, sección 17 del plan). El tipo se verifica por el contenido (los
 * primeros bytes), no por la extensión ni por lo que declara el navegador.
 */

export const TIPOS_IMAGEN = ["image/webp", "image/jpeg", "image/png"] as const;
export type TipoImagen = (typeof TIPOS_IMAGEN)[number];

export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;
export const LADO_MAXIMO_IMAGEN = 1600;

const EXTENSION: Record<TipoImagen, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
export const extensionDe = (tipo: TipoImagen) => EXTENSION[tipo];

export function detectarTipoImagen(bytes: Uint8Array): TipoImagen | null {
  const empieza = (firma: number[], desde = 0) => firma.every((b, i) => bytes[desde + i] === b);
  if (bytes.length >= 12 && empieza([0x52, 0x49, 0x46, 0x46]) && empieza([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (bytes.length >= 3 && empieza([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (bytes.length >= 8 && empieza([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}
