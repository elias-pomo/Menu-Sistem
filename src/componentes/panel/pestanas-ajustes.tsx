"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Pestañas de Ajustes. Usuarios e Historial solo para el dueño (las páginas lo vuelven a verificar). */
export function PestanasAjustes({ esDueno }: { esDueno: boolean }) {
  const ruta = usePathname();
  const pestanas = [
    { href: "/admin/ajustes", nombre: "Local" },
    ...(esDueno
      ? [
          { href: "/admin/ajustes/usuarios", nombre: "Usuarios" },
          { href: "/admin/ajustes/historial", nombre: "Historial" },
        ]
      : []),
    { href: "/admin/ajustes/contrasena", nombre: "Mi contraseña" },
  ];
  return (
    <nav aria-label="Ajustes" className="-mx-4 mb-5 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex gap-2">
        {pestanas.map((p) => {
          const activa = ruta === p.href;
          return (
            <li key={p.href} className="shrink-0">
              <Link href={p.href} aria-current={activa ? "page" : undefined} className={`inline-flex h-11 items-center rounded-full px-4 text-sm font-medium ${activa ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700"}`}>
                {p.nombre}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
