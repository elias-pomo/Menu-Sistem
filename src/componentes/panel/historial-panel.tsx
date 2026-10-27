"use client";

import { useState } from "react";
import { ErrorApi, llamarApi } from "./api";

/** Historial administrativo (RF-036): solo lectura, con "Ver más" por cursor. */

export type EntradaHistorial = { id: string; createdAt: string; user: string; description: string };

const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

export function HistorialPanel({ inicial, cursorInicial }: { inicial: EntradaHistorial[]; cursorInicial: string | null }) {
  const [entradas, setEntradas] = useState(inicial);
  const [cursor, setCursor] = useState(cursorInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function verMas() {
    if (!cursor) return;
    setCargando(true);
    setError("");
    try {
      const r = await llamarApi<{ entries: EntradaHistorial[]; nextCursor: string | null }>("GET", `/api/v1/admin/audit?cursor=${encodeURIComponent(cursor)}`);
      setEntradas((e) => [...e, ...r.entries]);
      setCursor(r.nextCursor);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : "No se pudo cargar.");
    } finally {
      setCargando(false);
    }
  }

  if (!entradas.length) return <p className="text-muted">Todavía no hay cambios registrados.</p>;

  return (
    <div className="flex flex-col gap-4">
      <ol className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
        {entradas.map((e) => (
          <li key={e.id} className="px-4 py-3">
            <p>{e.description}</p>
            <p className="text-sm text-muted">
              {e.user} · <time dateTime={e.createdAt}>{formatoFecha.format(new Date(e.createdAt))}</time>
            </p>
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {cursor && (
        <button type="button" onClick={verMas} disabled={cargando} className="h-12 self-center rounded-full bg-stone-100 px-6 font-medium text-stone-700 disabled:opacity-60">
          {cargando ? "Cargando…" : "Ver más"}
        </button>
      )}
    </div>
  );
}
