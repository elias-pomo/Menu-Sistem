/** Nombre de la cookie de sesión. Sin dependencias: lo usa también `proxy.ts`. */
export const NOMBRE_COOKIE = process.env.NODE_ENV === "production" ? "__Host-sesion" : "sesion";
