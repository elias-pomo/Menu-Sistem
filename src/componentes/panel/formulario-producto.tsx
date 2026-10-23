"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatearPesos, pesosACentavos } from "@/lib/dinero";
import { useHidratado } from "@/componentes/use-hidratado";
import { ErrorApi, llamarApi } from "./api";
import { SubirFoto } from "./subir-foto";

export type ProductoEditable = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  tags: string[];
  groupIds: string[];
  updatedAt: string;
};

type Props = {
  producto: ProductoEditable | null;
  categorias: { id: string; name: string }[];
  grupos: { id: string; name: string; detalle: string }[];
};

/** Alta y edición de un producto (RF-031). */
export function FormularioProducto({ producto, categorias, grupos }: Props) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(producto?.categoryId ?? categorias[0]?.id ?? "");
  const [name, setName] = useState(producto?.name ?? "");
  const [description, setDescription] = useState(producto?.description ?? "");
  const [precio, setPrecio] = useState(producto ? String(producto.priceCents / 100).replace(".", ",") : "");
  const [tags, setTags] = useState(producto?.tags.join(", ") ?? "");
  const [groupIds, setGroupIds] = useState<string[]>(producto?.groupIds ?? []);
  const [imageUrl, setImageUrl] = useState<string | null>(producto?.imageUrl ?? null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);
  const hidratado = useHidratado();

  const priceCents = pesosACentavos(precio);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (priceCents === null) {
      setErrores({ priceCents: "Ingresá el precio en pesos, por ejemplo 9.500." });
      return;
    }
    setEnviando(true);
    setErrores({});
    setGeneral("");
    const datos = {
      categoryId,
      name,
      description: description || null,
      priceCents,
      imageUrl,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      groupIds,
    };
    try {
      if (producto) await llamarApi("PATCH", `/api/v1/admin/products/${producto.id}`, { ...datos, expectedUpdatedAt: producto.updatedAt });
      else await llamarApi("POST", "/api/v1/admin/products", datos);
      router.push("/admin/menu");
      router.refresh();
    } catch (err) {
      setEnviando(false);
      if (err instanceof ErrorApi) {
        setErrores(err.fields);
        setGeneral(err.message);
      } else setGeneral("Ocurrió un error.");
    }
  }

  async function archivar() {
    if (!producto || !window.confirm(`¿Archivar "${producto.name}"? Deja de verse en el menú; los pedidos anteriores no cambian.`)) return;
    try {
      await llamarApi("DELETE", `/api/v1/admin/products/${producto.id}`);
      router.push("/admin/menu");
      router.refresh();
    } catch (err) {
      setGeneral(err instanceof ErrorApi ? err.message : "Ocurrió un error.");
    }
  }

  const campo = "h-12 w-full rounded-xl border border-stone-300 bg-white px-4";
  const error = (clave: string) =>
    errores[clave] && (
      <p className="mt-1 text-sm text-red-700" id={`error-${clave}`}>
        {errores[clave]}
      </p>
    );

  return (
    <form method="post" onSubmit={guardar} className="flex flex-col gap-5" noValidate>
      <div className="flex items-center gap-2">
        <Link href="/admin/menu" aria-label="Volver al menú" className="-ml-2 grid size-11 place-items-center rounded-full hover:bg-stone-100">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <h1 className="text-2xl font-bold">{producto ? "Editar producto" : "Nuevo producto"}</h1>
      </div>

      {general && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {general}
        </p>
      )}

      <label className="block">
        <span className="font-medium">Nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className={`mt-1 ${campo}`} />
        {error("name")}
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="font-medium">Categoría</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`mt-1 ${campo}`}>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {error("categoryId")}
        </label>
        <label className="block">
          <span className="font-medium">Precio</span>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-muted">$</span>
            <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" placeholder="9.500" className={`${campo} pl-8`} />
          </div>
          {priceCents !== null && precio && <p className="mt-1 text-sm text-muted">Se muestra como {formatearPesos(priceCents)}</p>}
          {error("priceCents")}
        </label>
      </div>

      <label className="block">
        <span className="font-medium">Descripción</span>
        <span className="ml-2 text-sm text-muted">Opcional</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-4 py-3" />
        {error("description")}
      </label>

      <div>
        <span className="font-medium">Foto</span>
        <span className="ml-2 text-sm text-muted">Opcional</span>
        <div className="mt-2">
          <SubirFoto url={imageUrl} onCambio={setImageUrl} />
        </div>
        {error("imageUrl")}
      </div>

      <label className="block">
        <span className="font-medium">Etiquetas</span>
        <span className="ml-2 text-sm text-muted">Separadas por coma, hasta 5 (ej.: nuevo, picante)</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} className={`mt-1 ${campo}`} />
        {error("tags")}
      </label>

      <fieldset>
        <legend className="font-medium">Grupos de opciones</legend>
        {grupos.length === 0 ? (
          <p className="mt-1 text-sm text-muted">
            No hay grupos todavía. <Link href="/admin/menu/opciones" className="underline">Crear uno</Link>
          </p>
        ) : (
          <div className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
            {grupos.map((g) => (
              <label key={g.id} className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2">
                <input
                  type="checkbox"
                  checked={groupIds.includes(g.id)}
                  onChange={() => setGroupIds((ids) => (ids.includes(g.id) ? ids.filter((i) => i !== g.id) : [...ids, g.id]))}
                  className="size-5 accent-[var(--primary)]"
                />
                <span className="flex-1">
                  {g.name}
                  <span className="block text-sm text-muted">{g.detalle}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {error("groupIds")}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={enviando || !hidratado} className="h-12 flex-1 rounded-full bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-50">
          {enviando ? "Guardando…" : "Guardar"}
        </button>
        {producto && (
          <button type="button" onClick={archivar} className="h-12 rounded-full border border-red-200 px-5 font-medium text-red-700">
            Archivar
          </button>
        )}
      </div>
    </form>
  );
}
