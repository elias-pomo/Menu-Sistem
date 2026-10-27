import type { Metadata } from "next";
import { CambiarContrasena } from "@/componentes/panel/cambiar-contrasena";

export const metadata: Metadata = { title: "Mi contraseña" };

/** Cualquier usuario cambia su propia contraseña. La sesión la verifica la ruta de la API. */
export default function PaginaContrasena() {
  return <CambiarContrasena />;
}
