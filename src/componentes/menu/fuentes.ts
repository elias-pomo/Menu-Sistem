import { Archivo, Instrument_Sans, Newsreader, Young_Serif } from "next/font/google";

/**
 * Tipografías del menú público. Se sirven desde el propio sitio (next/font), así la CSP no cambia.
 * Sin precarga: el navegador baja solo las del estilo que usa el local.
 *
 * - Nocturno: Archivo con el eje de ancho (condensada para los títulos, normal para el texto).
 * - Mantel: Newsreader para los títulos, con cursiva; Instrument Sans para el texto.
 * - Mostrador: Young Serif para los títulos; Instrument Sans para el texto.
 */
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--fuente-archivo", preload: false, display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--fuente-instrument", preload: false, display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--fuente-newsreader", preload: false, display: "swap" });
const youngSerif = Young_Serif({ subsets: ["latin"], weight: "400", variable: "--fuente-young", preload: false, display: "swap" });

export const variablesFuentes = [archivo.variable, instrument.variable, newsreader.variable, youngSerif.variable].join(" ");
