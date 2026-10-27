"use client";

import { BarChart3, ClipboardList, ExternalLink, LogOut, Settings, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { llamarApi } from "./api";
import { desactivarAvisos } from "./avisos-push";

const SECCIONES = [
  { href: "/admin", nombre: "Pedidos", icono: ClipboardList, exacta: true, soloEncargado: false },
  { href: "/admin/menu", nombre: "Menú", icono: UtensilsCrossed, exacta: false, soloEncargado: false },
  { href: "/admin/metricas", nombre: "Métricas", icono: BarChart3, exacta: false, soloEncargado: true },
  { href: "/admin/ajustes", nombre: "Ajustes", icono: Settings, exacta: false, soloEncargado: false },
];

const ITEM =
  "flex h-16 w-full flex-col items-center justify-center gap-1 text-xs md:h-11 md:flex-row md:justify-start md:gap-3 md:rounded-xl md:px-3 md:text-sm";

/**
 * Barra inferior en celular y lateral en pantallas anchas (sección 9 del plan). En el celular entran
 * 5 botones: el encargado y el dueño ven Métricas y "Ver menú" queda en Ajustes y en la barra lateral.
 */
export function BarraPanel({ negocio, slug, usuario, esEncargado }: { negocio: string; slug: string; usuario: string; esEncargado: boolean }) {
  const ruta = usePathname();
  const router = useRouter();

  async function salir() {
    // Un dispositivo compartido deja de recibir avisos de este usuario al salir.
    await desactivarAvisos();
    await llamarApi("POST", "/api/v1/admin/auth/logout", {}).catch(() => {});
    router.replace("/admin/ingresar");
    router.refresh();
  }

  return (
    <nav
      aria-label="Panel"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:inset-y-0 md:left-0 md:right-auto md:w-56 md:border-r md:border-t-0"
    >
      <div className="hidden px-4 pb-4 pt-6 md:block">
        <p className="font-bold">{negocio}</p>
        <p className="text-sm text-muted">{usuario}</p>
      </div>
      <ul className="flex md:flex-col md:gap-1 md:px-2">
        {SECCIONES.filter((s) => esEncargado || !s.soloEncargado).map(({ href, nombre, icono: Icono, exacta }) => {
          const activa = exacta ? ruta === href : ruta.startsWith(href);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link href={href} aria-current={activa ? "page" : undefined} className={`${ITEM} ${activa ? "font-semibold text-primary md:bg-stone-100" : "text-stone-600"}`}>
                <Icono className="size-5" aria-hidden />
                {nombre}
              </Link>
            </li>
          );
        })}
        <li className={esEncargado ? "hidden md:block" : "flex-1 md:flex-none"}>
          <a href={`/${slug}`} target="_blank" rel="noreferrer" className={`${ITEM} text-stone-600`}>
            <ExternalLink className="size-5" aria-hidden />
            Ver menú
          </a>
        </li>
        <li className="flex-1 md:flex-none">
          <button type="button" onClick={salir} className={`${ITEM} text-stone-600`}>
            <LogOut className="size-5" aria-hidden />
            Salir
          </button>
        </li>
      </ul>
    </nav>
  );
}
