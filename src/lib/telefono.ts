import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * Celulares argentinos. Acepta cómo los escribe la gente ("0381 15-555-1234", "381 555 1234",
 * "+54 9 381 555 1234") y los devuelve en E.164 con el 9 de celular: "+5493815551234" (RF-011).
 */
export function normalizarCelularAR(entrada: string): string | null {
  const texto = entrada.trim();
  if (!texto || /[a-zA-Z]/.test(texto)) return null;
  let numero = parsePhoneNumberFromString(texto, "AR");
  if (!numero || numero.country !== "AR" || !numero.isValid()) return null;
  // En Argentina fijos y celulares comparten numeración: solo el 15 (o el 9) los distingue. Mucha
  // gente escribe el celular sin el 15 ("381 555-1234"); como el campo pide un celular, se lo toma
  // como tal agregando el 9.
  if (numero.getType() === "FIXED_LINE") {
    numero = parsePhoneNumberFromString(`+549${numero.nationalNumber}`);
    if (!numero || !numero.isValid()) return null;
  }
  const tipo = numero.getType();
  if (tipo !== "MOBILE" && tipo !== "FIXED_LINE_OR_MOBILE") return null;
  return numero.number;
}

/** Número para un enlace wa.me: solo dígitos, con código de país (ej. 5493815551234). */
export function numeroWhatsApp(e164: string): string {
  return e164.replace(/\D/g, "");
}

/** Para logs: deja ver solo los últimos 4 dígitos (RNF-011). */
export function enmascararTelefono(telefono: string | null | undefined): string {
  if (!telefono) return "";
  return `***${telefono.replace(/\D/g, "").slice(-4)}`;
}
