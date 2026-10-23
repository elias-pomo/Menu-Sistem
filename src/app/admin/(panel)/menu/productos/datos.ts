import "server-only";
import { formatearPesos } from "@/lib/dinero";
import type { UsuarioSesion } from "@/modulos/autenticacion";
import { listarMenuAdmin } from "@/modulos/menu";

/** Categorías y grupos para el formulario de producto. */
export async function opcionesDelFormulario(sesion: UsuarioSesion) {
  const { categorias, grupos } = await listarMenuAdmin(sesion);
  return {
    categorias: categorias.map((c) => ({ id: c.id, name: c.name })),
    grupos: grupos.map((g) => ({
      id: g.id,
      name: g.name,
      detalle: g.options
        .map((o) => (o.priceDeltaCents > 0 ? `${o.name} +${formatearPesos(o.priceDeltaCents)}` : o.name))
        .join(" · "),
    })),
  };
}
