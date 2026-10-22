import { hash, verify } from "@node-rs/argon2";

/**
 * Contraseñas con Argon2id (el algoritmo por defecto de @node-rs/argon2), con los parámetros mínimos
 * que recomienda OWASP: 19 MiB de memoria, 2 iteraciones, 1 hilo. Nunca se registran ni se auditan.
 */
const PARAMETROS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const LARGO_MINIMO_CONTRASENA = 10;

// Las más usadas que cumplen el largo mínimo. Lista corta a propósito: el largo hace el resto.
const COMUNES = new Set([
  "1234567890",
  "12345678910",
  "0123456789",
  "1111111111",
  "qwertyuiop",
  "contrasena",
  "contraseña",
  "contrasena1",
  "password123",
  "password1234",
  "administrador",
  "qwerty12345",
  "asdfghjklñ",
  "iloveyou123",
  "abcdefghij",
]);

/** Devuelve el mensaje de error, o null si la contraseña es aceptable. */
export function problemaConContrasena(contrasena: string): string | null {
  if (contrasena.length < LARGO_MINIMO_CONTRASENA) {
    return `La contraseña tiene que tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`;
  }
  if (contrasena.length > 200) return "La contraseña es demasiado larga.";
  if (COMUNES.has(contrasena.toLowerCase())) return "Esa contraseña es muy común. Elegí otra.";
  return null;
}

export function hashearContrasena(contrasena: string): Promise<string> {
  return hash(contrasena, PARAMETROS);
}

export async function verificarContrasena(hashGuardado: string, contrasena: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, contrasena);
  } catch {
    return false;
  }
}

/**
 * Hash de una contraseña al azar: se verifica contra él cuando el email no existe, para que la
 * respuesta tarde lo mismo y no revele qué emails están registrados.
 */
let hashSenuelo: Promise<string> | undefined;
export function obtenerHashSenuelo(): Promise<string> {
  hashSenuelo ??= hashearContrasena(`senuelo-${Math.random()}-${Date.now()}`);
  return hashSenuelo;
}
