"use client";

import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatearPesos, pesosACentavos } from "@/lib/dinero";
import { useHidratado } from "@/componentes/use-hidratado";
import { ErrorApi, llamarApi } from "./api";

type Opcion = { id?: string; name: string; priceDeltaCents: number; isAvailable: boolean };
export type GrupoEditable = {
  id: string;
  name: string;
  kind: "CHOICE" | "REMOVE";
  minSelect: number;
  maxSelect: number;
  productos: number;
  options: Opcion[];
};

const GRUPO_NUEVO: Omit<GrupoEditable, "id" | "productos"> = {
  name: "",
  kind: "CHOICE",
  minSelect: 1,
  maxSelect: 1,
  options: [{ name: "", priceDeltaCents: 0, isAvailable: true }],
};

/** Grupos de opciones reutilizables entre productos (RF-033). */
export function GruposOpciones({ grupos }: { grupos: GrupoEditable[] }) {
  const [editando, setEditando] = useState<string | "nuevo" | null>(grupos.length ? null : "nuevo");

  return (
    <section>
      <div className="flex items-center gap-2">
        <Link href="/admin/menu" aria-label="Volver al menú" className="-ml-2 grid size-11 place-items-center rounded-full hover:bg-stone-100">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <h1 className="mr-auto text-2xl font-bold">Opciones</h1>
        {editando !== "nuevo" && (
          <button type="button" onClick={() => setEditando("nuevo")} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
            <Plus className="size-4" aria-hidden />
            Grupo
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">Tamaños, variantes, agregados o ingredientes para sacar. Un grupo se puede usar en varios productos.</p>

      <div className="mt-4 flex flex-col gap-3">
        {editando === "nuevo" && <EditorGrupo inicial={null} onListo={() => setEditando(null)} />}
        {grupos.map((g) =>
          editando === g.id ? (
            <EditorGrupo key={g.id} inicial={g} onListo={() => setEditando(null)} />
          ) : (
            <article key={g.id} className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{g.name}</h2>
                <p className="text-sm text-muted">
                  {g.kind === "REMOVE" ? "Para sacar" : g.minSelect > 0 ? "Obligatorio" : "Opcional"} · {g.maxSelect === 1 ? "elegir 1" : `hasta ${g.maxSelect}`} · en{" "}
                  {g.productos} {g.productos === 1 ? "producto" : "productos"}
                </p>
                <p className="mt-1 text-sm">
                  {g.options.map((o) => `${o.name}${o.priceDeltaCents ? ` +${formatearPesos(o.priceDeltaCents)}` : ""}${o.isAvailable ? "" : " (agotada)"}`).join(" · ")}
                </p>
              </div>
              <button type="button" onClick={() => setEditando(g.id)} className="h-11 rounded-full px-4 text-sm font-medium text-primary hover:bg-stone-100">
                Editar
              </button>
            </article>
          ),
        )}
      </div>
    </section>
  );
}

function EditorGrupo({ inicial, onListo }: { inicial: GrupoEditable | null; onListo: () => void }) {
  const router = useRouter();
  const [grupo, setGrupo] = useState(() => ({ ...(inicial ?? GRUPO_NUEVO), options: (inicial ?? GRUPO_NUEVO).options.map((o) => ({ ...o })) }));
  const [precios, setPrecios] = useState(() => grupo.options.map((o) => (o.priceDeltaCents ? String(o.priceDeltaCents / 100) : "")));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);
  const hidratado = useHidratado();

  const cambiarOpcion = (i: number, cambio: Partial<Opcion>) =>
    setGrupo((g) => ({ ...g, options: g.options.map((o, j) => (j === i ? { ...o, ...cambio } : o)) }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const options = grupo.options.map((o, i) => ({ ...o, priceDeltaCents: grupo.kind === "REMOVE" ? 0 : (pesosACentavos(precios[i] || "0") ?? -1) }));
    const malPrecio = options.findIndex((o) => o.priceDeltaCents < 0);
    if (malPrecio >= 0) {
      setErrores({ [`options.${malPrecio}.priceDeltaCents`]: "Importe inválido." });
      return;
    }
    setEnviando(true);
    setErrores({});
    setGeneral("");
    const cuerpo = { name: grupo.name, kind: grupo.kind, minSelect: grupo.minSelect, maxSelect: grupo.maxSelect, options };
    try {
      if (inicial) await llamarApi("PATCH", `/api/v1/admin/option-groups/${inicial.id}`, cuerpo);
      else await llamarApi("POST", "/api/v1/admin/option-groups", cuerpo);
      router.refresh();
      onListo();
    } catch (err) {
      setEnviando(false);
      if (err instanceof ErrorApi) {
        setErrores(err.fields);
        setGeneral(err.message);
      } else setGeneral("Ocurrió un error.");
    }
  }

  async function archivar() {
    if (!inicial) return;
    const aviso = inicial.productos ? ` Se va a sacar de ${inicial.productos} ${inicial.productos === 1 ? "producto" : "productos"}.` : "";
    if (!window.confirm(`¿Archivar el grupo "${inicial.name}"?${aviso}`)) return;
    try {
      await llamarApi("DELETE", `/api/v1/admin/option-groups/${inicial.id}`);
      router.refresh();
      onListo();
    } catch (err) {
      setGeneral(err instanceof ErrorApi ? err.message : "Ocurrió un error.");
    }
  }

  const campo = "h-11 w-full rounded-xl border border-stone-300 bg-white px-3";
  const error = (clave: string) => errores[clave] && <p className="mt-1 text-sm text-red-700">{errores[clave]}</p>;

  return (
    <form method="post" onSubmit={guardar} className="flex flex-col gap-4 rounded-2xl border-2 border-primary/40 bg-white p-4" noValidate>
      {general && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          {general}
        </p>
      )}
      <label className="block">
        <span className="text-sm font-medium">Nombre del grupo</span>
        <input value={grupo.name} onChange={(e) => setGrupo({ ...grupo, name: e.target.value })} maxLength={60} placeholder="Tamaño" className={`mt-1 ${campo}`} />
        {error("name")}
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-sm font-medium">Tipo</span>
          <select value={grupo.kind} onChange={(e) => setGrupo({ ...grupo, kind: e.target.value as GrupoEditable["kind"] })} className={`mt-1 ${campo}`}>
            <option value="CHOICE">Elegir</option>
            <option value="REMOVE">Para sacar</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Mínimo</span>
          <input type="number" inputMode="numeric" min={0} max={20} value={grupo.minSelect} onChange={(e) => setGrupo({ ...grupo, minSelect: Number(e.target.value) })} className={`mt-1 ${campo}`} />
          {error("minSelect")}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Máximo</span>
          <input type="number" inputMode="numeric" min={1} max={20} value={grupo.maxSelect} onChange={(e) => setGrupo({ ...grupo, maxSelect: Number(e.target.value) })} className={`mt-1 ${campo}`} />
          {error("maxSelect")}
        </label>
      </div>
      <p className="-mt-2 text-sm text-muted">Mínimo 1 y máximo 1 = el cliente tiene que elegir una sola opción (por ejemplo, el tamaño).</p>

      <fieldset>
        <legend className="text-sm font-medium">Opciones</legend>
        <div className="mt-1 flex flex-col gap-2">
          {grupo.options.map((o, i) => (
            <div key={o.id ?? `nueva-${i}`} className="flex flex-wrap items-center gap-2">
              <input
                aria-label={`Nombre de la opción ${i + 1}`}
                value={o.name}
                onChange={(e) => cambiarOpcion(i, { name: e.target.value })}
                maxLength={80}
                placeholder="Doble"
                className="h-11 min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3"
              />
              {grupo.kind === "CHOICE" && (
                <div className="relative w-28">
                  <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted">+$</span>
                  <input
                    aria-label={`Adicional de la opción ${i + 1}`}
                    value={precios[i] ?? ""}
                    onChange={(e) => setPrecios((p) => p.map((v, j) => (j === i ? e.target.value : v)))}
                    inputMode="decimal"
                    placeholder="0"
                    className="h-11 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-2"
                  />
                </div>
              )}
              <label className="flex h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={!o.isAvailable} onChange={(e) => cambiarOpcion(i, { isAvailable: !e.target.checked })} className="size-5 accent-red-700" />
                Agotada
              </label>
              <button
                type="button"
                aria-label={`Quitar la opción ${o.name || i + 1}`}
                disabled={grupo.options.length === 1}
                onClick={() => {
                  setGrupo((g) => ({ ...g, options: g.options.filter((_, j) => j !== i) }));
                  setPrecios((p) => p.filter((_, j) => j !== i));
                }}
                className="grid size-11 place-items-center rounded-full text-stone-500 hover:bg-stone-100 disabled:opacity-25"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
              {error(`options.${i}.name`)}
              {error(`options.${i}.priceDeltaCents`)}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setGrupo((g) => ({ ...g, options: [...g.options, { name: "", priceDeltaCents: 0, isAvailable: true }] }));
            setPrecios((p) => [...p, ""]);
          }}
          className="mt-2 inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-primary hover:bg-stone-100"
        >
          <Plus className="size-4" aria-hidden />
          Agregar opción
        </button>
        {error("options")}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={enviando || !hidratado} className="h-11 flex-1 rounded-full bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50">
          {enviando ? "Guardando…" : "Guardar grupo"}
        </button>
        <button type="button" onClick={onListo} className="h-11 rounded-full border border-stone-300 px-4 font-medium">
          Cancelar
        </button>
        {inicial && (
          <button type="button" onClick={archivar} className="h-11 rounded-full px-4 font-medium text-red-700 hover:bg-red-50">
            Archivar
          </button>
        )}
      </div>
    </form>
  );
}
