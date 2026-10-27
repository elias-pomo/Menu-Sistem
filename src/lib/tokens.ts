import { createHash, randomBytes, randomInt } from "node:crypto";

/** Token público de seguimiento: 128 bits aleatorios en base64url (22 caracteres). */
export function generarTokenPublico(): string {
  return randomBytes(16).toString("base64url");
}

/** Token de sesión: 256 bits aleatorios. */
export function generarTokenSesion(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

// Sin 0/O ni 1/I/L: el código se dicta por teléfono y se lee en una pantalla de cocina.
const ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Código corto del pedido (4 caracteres). Que no se repita por negocio y día lo garantiza la base. */
export function generarCodigoCorto(): string {
  let codigo = "";
  for (let i = 0; i < 4; i++) codigo += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
  return codigo;
}

export const FORMATO_TOKEN_PUBLICO = /^[A-Za-z0-9_-]{22}$/;

const ALFABETO_TEMPORAL = "23456789abcdefghjkmnpqrstuvwxyz";

/**
 * Contraseña temporal para un usuario nuevo: 3 grupos de 4 ("k7p2-x9mf-3qhr"), sin letras ni números
 * que se confundan, para dictarla o copiarla al celular. Unos 59 bits de azar.
 */
export function generarContrasenaTemporal(): string {
  const grupo = () => Array.from({ length: 4 }, () => ALFABETO_TEMPORAL[randomInt(ALFABETO_TEMPORAL.length)]).join("");
  return `${grupo()}-${grupo()}-${grupo()}`;
}
