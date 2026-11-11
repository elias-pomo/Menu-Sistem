import type { CSSProperties, ReactNode } from "react";
import { textoSobre } from "@/lib/color";
import type { EstiloMenu } from "@/modulos/menu/estilos";
import { variablesFuentes } from "./fuentes";

/** Variables de color del negocio, con el texto sobre el color principal calculado por contraste. */
export function estiloNegocio(color: string): CSSProperties {
  return { "--primary": color, "--primary-foreground": textoSobre(color) } as CSSProperties;
}

/**
 * Contenedor de toda pantalla del cliente: aplica el estilo del local (tipografías, fondo y forma,
 * definidos en globals.css por `data-estilo`) y su color.
 */
export function MarcoMenu({ estilo, color, className = "", children }: { estilo: EstiloMenu; color: string; className?: string; children: ReactNode }) {
  return (
    <div data-estilo={estilo} style={estiloNegocio(color)} className={`${variablesFuentes} min-h-dvh bg-lienzo font-cuerpo text-tinta antialiased ${className}`}>
      {children}
    </div>
  );
}
