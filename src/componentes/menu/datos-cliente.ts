/**
 * Nombre, celular y dirección recordados en el dispositivo para el próximo pedido (sección 10 del
 * plan). Solo se leen en el navegador, nunca en el render del servidor.
 */

export type DatosCliente = {
  name: string;
  phone: string;
  street: string;
  number: string;
  neighborhood: string;
  unit: string;
  reference: string;
};

export const DATOS_VACIOS: DatosCliente = { name: "", phone: "", street: "", number: "", neighborhood: "", unit: "", reference: "" };

const CLAVE = "cliente";

export function leerDatosCliente(): DatosCliente {
  try {
    const guardado = JSON.parse(window.localStorage.getItem(CLAVE) ?? "null") as Partial<DatosCliente> | null;
    if (!guardado || typeof guardado !== "object") return DATOS_VACIOS;
    return Object.fromEntries(
      Object.entries(DATOS_VACIOS).map(([k, v]) => [k, typeof guardado[k as keyof DatosCliente] === "string" ? guardado[k as keyof DatosCliente] : v]),
    ) as DatosCliente;
  } catch {
    return DATOS_VACIOS;
  }
}

export function guardarDatosCliente(datos: DatosCliente) {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    // Sin localStorage: la próxima vez se completa de nuevo.
  }
}
