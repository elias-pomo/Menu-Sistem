"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EstiloMenu } from "@/modulos/menu/estilos";
import type { CategoriaPublica } from "@/modulos/menu/tipos";

/**
 * Barra de categorías fija arriba. Marca la sección que se está leyendo (sigue el scroll) con un
 * indicador que se desliza, y se mueve sola para que la categoría marcada quede a la vista.
 */
export function NavCategorias({ categorias, estilo }: { categorias: CategoriaPublica[]; estilo: EstiloMenu }) {
  const [activa, setActiva] = useState(categorias[0]?.id ?? "");
  const [pegada, setPegada] = useState(false);
  const [indicador, setIndicador] = useState<{ x: number; ancho: number } | null>(null);
  const lista = useRef<HTMLUListElement>(null);
  const enlaces = useRef(new Map<string, HTMLAnchorElement>());
  const centinela = useRef<HTMLDivElement>(null);
  // Mientras dura un scroll pedido con un toque, el observador no cambia la marca.
  const saltando = useRef(false);

  useEffect(() => {
    const secciones = categorias.map((c) => document.getElementById(`cat-${c.id}`)).filter((s): s is HTMLElement => !!s);
    const observador = new IntersectionObserver(
      (entradas) => {
        if (saltando.current) return;
        const visible = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiva(visible.target.id.slice(4));
      },
      // Cuenta como "leyendo" la sección que cruza la franja de arriba de la pantalla.
      { rootMargin: "-96px 0px -60% 0px" },
    );
    secciones.forEach((s) => observador.observe(s));
    return () => observador.disconnect();
  }, [categorias]);

  useEffect(() => {
    const el = centinela.current;
    if (!el) return;
    const observador = new IntersectionObserver(([e]) => setPegada(!e.isIntersecting));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  useLayoutEffect(() => {
    const medir = () => {
      // Se mide el <li>: su posición es relativa a la lista, que es la que se desplaza.
      const enlace = enlaces.current.get(activa)?.parentElement;
      if (!enlace) return;
      setIndicador({ x: enlace.offsetLeft, ancho: enlace.offsetWidth });
      const ul = lista.current;
      if (ul && (enlace.offsetLeft < ul.scrollLeft + 16 || enlace.offsetLeft + enlace.offsetWidth > ul.scrollLeft + ul.clientWidth - 16)) {
        ul.scrollTo({ left: enlace.offsetLeft - 20, behavior: "smooth" });
      }
    };
    medir();
    window.addEventListener("resize", medir);
    // Las fuentes web cambian el ancho de los textos al cargar.
    document.fonts?.ready.then(medir);
    return () => window.removeEventListener("resize", medir);
  }, [activa]);

  function ir(id: string, evento: React.MouseEvent) {
    const seccion = document.getElementById(`cat-${id}`);
    if (!seccion) return;
    evento.preventDefault();
    setActiva(id);
    saltando.current = true;
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    seccion.scrollIntoView({ behavior: reducir ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => (saltando.current = false), 700);
  }

  const texto = {
    NOCTURNO: "text-[13px] font-bold uppercase tracking-[0.1em]",
    MANTEL: "font-[family-name:var(--m-display)] text-[17px] italic",
    MOSTRADOR: "text-[15px] font-medium",
  }[estilo];

  return (
    <>
      <div ref={centinela} aria-hidden />
      <nav
        aria-label="Categorías"
        className={`sticky top-0 z-10 bg-lienzo/95 backdrop-blur-xl transition-[border-color,box-shadow] duration-200 ${
          pegada ? "border-b border-linea shadow-[0_8px_24px_-20px_rgb(0_0_0/0.5)]" : "border-b border-transparent"
        }`}
      >
        <ul ref={lista} className="relative mx-auto flex max-w-2xl gap-1 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {indicador && (
            <li
              aria-hidden
              style={{ transform: `translateX(${indicador.x}px)`, width: indicador.ancho }}
              className={`pointer-events-none absolute left-0 transition-[transform,width] duration-300 ease-salida ${
                estilo === "MOSTRADOR" ? "top-1.5 h-11 rounded-full bg-realce" : "bottom-0 h-0.5 bg-acento mantel:bg-tinta"
              }`}
            />
          )}
          {categorias.map((c) => (
            <li key={c.id} className="relative shrink-0">
              <a
                ref={(el) => {
                  if (el) enlaces.current.set(c.id, el);
                  else enlaces.current.delete(c.id);
                }}
                href={`#cat-${c.id}`}
                onClick={(e) => ir(c.id, e)}
                aria-current={activa === c.id ? "true" : undefined}
                className={`inline-flex h-14 items-center whitespace-nowrap px-3.5 transition-colors duration-200 ${texto} ${
                  activa === c.id ? "text-tinta" : "text-tinta-suave hover:text-tinta"
                }`}
              >
                {c.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
