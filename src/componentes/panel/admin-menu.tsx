"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatearPesos } from "@/lib/dinero";
import { useHidratado } from "@/componentes/use-hidratado";
import { ErrorApi, llamarApi } from "./api";

type ProductoFila = { id: string; name: string; priceCents: number; isActive: boolean; isSoldOut: boolean; imageUrl: string | null; grupos: number };
type CategoriaFila = { id: string; name: string; isActive: boolean; products: ProductoFila[] };

/** Menú en el panel (RF-030 a RF-032): agotado y visible en un toque; el resto, solo encargado o dueño. */
export function AdminMenu({ categorias, grupos, puedeEditar }: { categorias: CategoriaFila[]; grupos: { id: string; name: string }[]; puedeEditar: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState("");
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const hidratado = useHidratado();

  /** Llama a la API y recarga los datos del servidor. */
  function accion(llamada: () => Promise<unknown>) {
    setError("");
    iniciar(async () => {
      try {
        await llamada();
        router.refresh();
      } catch (err) {
        setError(err instanceof ErrorApi ? err.message : "Ocurrió un error.");
      }
    });
  }

  const mover = (lista: string[], i: number, delta: number) => {
    const copia = [...lista];
    [copia[i], copia[i + delta]] = [copia[i + delta], copia[i]];
    return copia;
  };

  return (
    <section aria-busy={pendiente}>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">Menú</h1>
        {puedeEditar && (
          <>
            <Link href="/admin/menu/opciones" className="inline-flex h-11 items-center gap-2 rounded-full border border-stone-300 px-4 text-sm font-medium">
              <Settings2 className="size-4" aria-hidden />
              Opciones ({grupos.length})
            </Link>
            <Link href="/admin/menu/productos/nuevo" className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
              <Plus className="size-4" aria-hidden />
              Producto
            </Link>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {categorias.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-stone-300 p-6 text-center text-muted">
          Todavía no hay categorías. Creá la primera abajo y después cargá tu primer producto.
        </div>
      )}

      <div className="mt-4 flex flex-col gap-5">
        {categorias.map((categoria, ci) => (
          <article key={categoria.id} className="rounded-2xl border border-stone-200 bg-white">
            <header className="flex flex-wrap items-center gap-1 border-b border-stone-100 px-4 py-2">
              <h2 className={`mr-auto py-2 font-bold ${categoria.isActive ? "" : "text-stone-400 line-through"}`}>{categoria.name}</h2>
              {puedeEditar && (
                <>
                  <BotonIcono etiqueta={`Subir ${categoria.name}`} disabled={ci === 0} onClick={() => accion(() => llamarApi("POST", "/api/v1/admin/categories/reorder", { ids: mover(categorias.map((c) => c.id), ci, -1) }))}>
                    <ArrowUp className="size-4" />
                  </BotonIcono>
                  <BotonIcono
                    etiqueta={`Bajar ${categoria.name}`}
                    disabled={ci === categorias.length - 1}
                    onClick={() => accion(() => llamarApi("POST", "/api/v1/admin/categories/reorder", { ids: mover(categorias.map((c) => c.id), ci, 1) }))}
                  >
                    <ArrowDown className="size-4" />
                  </BotonIcono>
                  <BotonIcono
                    etiqueta={categoria.isActive ? `Ocultar ${categoria.name}` : `Mostrar ${categoria.name}`}
                    onClick={() => accion(() => llamarApi("PATCH", `/api/v1/admin/categories/${categoria.id}`, { isActive: !categoria.isActive }))}
                  >
                    {categoria.isActive ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </BotonIcono>
                  <BotonIcono
                    etiqueta={`Renombrar ${categoria.name}`}
                    onClick={() => {
                      const nombre = window.prompt("Nuevo nombre de la categoría", categoria.name)?.trim();
                      if (nombre && nombre !== categoria.name) accion(() => llamarApi("PATCH", `/api/v1/admin/categories/${categoria.id}`, { name: nombre }));
                    }}
                  >
                    <Pencil className="size-4" />
                  </BotonIcono>
                  <BotonIcono
                    etiqueta={`Archivar ${categoria.name}`}
                    onClick={() => {
                      if (window.confirm(`¿Archivar "${categoria.name}" y sus ${categoria.products.length} productos? Dejan de verse en el menú.`)) {
                        accion(() => llamarApi("DELETE", `/api/v1/admin/categories/${categoria.id}`));
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </BotonIcono>
                </>
              )}
            </header>

            {categoria.products.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">Sin productos.</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {categoria.products.map((producto, pi) => (
                  <li key={producto.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <div className="min-w-0 flex-1 py-1">
                      <p className={`font-medium ${producto.isActive ? "" : "text-stone-400"}`}>
                        {producto.name}
                        {!producto.isActive && <span className="ml-2 text-xs font-normal">(oculto)</span>}
                      </p>
                      <p className="text-sm text-muted">
                        {formatearPesos(producto.priceCents)}
                        {producto.grupos > 0 && ` · ${producto.grupos} ${producto.grupos === 1 ? "grupo" : "grupos"} de opciones`}
                        {!producto.imageUrl && " · sin foto"}
                      </p>
                    </div>
                    <label className="flex h-11 cursor-pointer items-center gap-2 rounded-full border border-stone-200 px-3 text-sm">
                      <input
                        type="checkbox"
                        checked={producto.isSoldOut}
                        onChange={() => accion(() => llamarApi("PATCH", `/api/v1/admin/products/${producto.id}/availability`, { isSoldOut: !producto.isSoldOut }))}
                        className="size-5 accent-red-700"
                      />
                      Agotado
                    </label>
                    <BotonIcono
                      etiqueta={producto.isActive ? `Ocultar ${producto.name}` : `Mostrar ${producto.name}`}
                      onClick={() => accion(() => llamarApi("PATCH", `/api/v1/admin/products/${producto.id}/availability`, { isActive: !producto.isActive }))}
                    >
                      {producto.isActive ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </BotonIcono>
                    {puedeEditar && (
                      <>
                        <BotonIcono
                          etiqueta={`Subir ${producto.name}`}
                          disabled={pi === 0}
                          onClick={() =>
                            accion(() => llamarApi("POST", "/api/v1/admin/products/reorder", { categoryId: categoria.id, ids: mover(categoria.products.map((p) => p.id), pi, -1) }))
                          }
                        >
                          <ArrowUp className="size-4" />
                        </BotonIcono>
                        <BotonIcono
                          etiqueta={`Bajar ${producto.name}`}
                          disabled={pi === categoria.products.length - 1}
                          onClick={() =>
                            accion(() => llamarApi("POST", "/api/v1/admin/products/reorder", { categoryId: categoria.id, ids: mover(categoria.products.map((p) => p.id), pi, 1) }))
                          }
                        >
                          <ArrowDown className="size-4" />
                        </BotonIcono>
                        <Link
                          href={`/admin/menu/productos/${producto.id}`}
                          aria-label={`Editar ${producto.name}`}
                          className="grid size-11 place-items-center rounded-full text-stone-600 hover:bg-stone-100"
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Link>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>

      {puedeEditar && (
        <form
          method="post"
          className="mt-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const nombre = nuevaCategoria.trim();
            if (!nombre) return;
            accion(async () => {
              await llamarApi("POST", "/api/v1/admin/categories", { name: nombre });
              setNuevaCategoria("");
            });
          }}
        >
          <label className="sr-only" htmlFor="nueva-categoria">
            Nueva categoría
          </label>
          <input
            id="nueva-categoria"
            value={nuevaCategoria}
            onChange={(e) => setNuevaCategoria(e.target.value)}
            maxLength={60}
            placeholder="Nueva categoría"
            className="h-11 min-w-0 flex-1 rounded-full border border-stone-300 bg-white px-4"
          />
          <button type="submit" disabled={pendiente || !hidratado || !nuevaCategoria.trim()} className="h-11 rounded-full border border-stone-300 px-4 font-medium disabled:opacity-40">
            Agregar
          </button>
        </form>
      )}
    </section>
  );
}

function BotonIcono({ etiqueta, onClick, disabled, children }: { etiqueta: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={etiqueta} title={etiqueta} onClick={onClick} disabled={disabled} className="grid size-11 place-items-center rounded-full text-stone-600 hover:bg-stone-100 disabled:opacity-25">
      {children}
    </button>
  );
}
