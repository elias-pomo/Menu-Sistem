import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { UsuariosPanel } from "@/componentes/panel/usuarios-panel";
import { sesionDePagina, tieneRolMinimo } from "@/modulos/autenticacion";
import { listarUsuarios } from "@/modulos/usuarios";

export const metadata: Metadata = { title: "Usuarios" };

export default function PaginaUsuarios() {
  return (
    <Suspense fallback={<p className="text-muted">Cargando…</p>}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const sesion = await sesionDePagina();
  if (!tieneRolMinimo(sesion.role, "OWNER")) redirect("/admin/ajustes");
  const usuarios = await listarUsuarios(sesion);
  return <UsuariosPanel yo={sesion.userId} usuarios={usuarios.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))} />;
}
