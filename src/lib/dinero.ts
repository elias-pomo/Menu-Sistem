/**
 * Importes en centavos de ARS, siempre enteros (RN-01). Nunca se usan decimales de punto flotante
 * para guardar ni sumar: los pesos con decimales solo existen al mostrar o al leer un formulario.
 */

export type Centavos = number;

/** Tope de seguridad: muy por encima de cualquier pedido real y muy por debajo de MAX_SAFE_INTEGER. */
export const MAX_CENTAVOS = 10_000_000_000; // $ 100.000.000

export function esCentavosValido(valor: unknown): valor is Centavos {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0 && valor <= MAX_CENTAVOS;
}

export function assertCentavos(valor: number, contexto = "importe"): Centavos {
  if (!esCentavosValido(valor)) throw new RangeError(`${contexto} inválido: ${valor}`);
  return valor;
}

export function sumarCentavos(valores: readonly Centavos[]): Centavos {
  return assertCentavos(
    valores.reduce((total, v) => total + assertCentavos(v), 0),
    "suma",
  );
}

export function multiplicarCentavos(valor: Centavos, cantidad: number): Centavos {
  if (!Number.isInteger(cantidad) || cantidad < 0) throw new RangeError(`cantidad inválida: ${cantidad}`);
  return assertCentavos(assertCentavos(valor) * cantidad, "producto");
}

const formatoEntero = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoDecimal = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

/** "$ 18.400", o "$ 18.400,50" si hay centavos. */
export function formatearPesos(centavos: Centavos): string {
  assertCentavos(centavos);
  return centavos % 100 === 0 ? formatoEntero.format(centavos / 100) : formatoDecimal.format(centavos / 100);
}

/**
 * Lee un importe en pesos con formato argentino ("1.500", "1500,5", "$ 1.500,50") y lo pasa a
 * centavos. Devuelve null si no es válido. Trabaja con texto para no perder precisión.
 */
export function pesosACentavos(texto: string): Centavos | null {
  const limpio = texto.replace(/\$/g, "").replace(/\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpio)) return null;
  const [entero, decimales = ""] = limpio.replace(/\./g, "").split(",");
  const centavos = Number(entero) * 100 + Number(decimales.padEnd(2, "0"));
  return esCentavosValido(centavos) ? centavos : null;
}
