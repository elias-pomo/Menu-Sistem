"use client";

import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { ErrorApi, llamarApi } from "./api";

const MENSAJES = ["Volvemos en 30 minutos.", "Estamos con mucha demora, volvé en un rato.", "Hoy no tomamos más pedidos."];

/**
 * Pausar o reanudar los pedidos desde la pantalla de pedidos (RF-034). Lo puede usar cualquier
 * usuario del local: es lo primero que se necesita cuando la cocina se satura.
 */
export function PausaPedidos({ aceptando, onCambio }: { aceptando: boolean; onCambio: (aceptando: boolean) => void }) {
  const [eligiendo, setEligiendo] = useState(false);
  const [mensaje, setMensaje] = useState(MENSAJES[0]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function cambiar(pausar: boolean) {
    setEnviando(true);
    setError("");
    try {
      await llamarApi("POST", "/api/v1/admin/settings/pause", { paused: pausar, message: pausar ? mensaje.trim() || null : null });
      onCambio(!pausar);
      setEligiendo(false);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : "No se pudo cambiar. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (!aceptando) {
    return (
      <div className="flex w-full flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="flex-1">Los pedidos están pausados: el menú no acepta pedidos nuevos.</p>
        <button type="button" onClick={() => cambiar(false)} disabled={enviando} className="inline-flex h-11 items-center gap-2 rounded-full bg-amber-900 px-4 font-medium text-white disabled:opacity-60">
          <Play className="size-4" aria-hidden />
          Reanudar pedidos
        </button>
        {error && <p role="alert" className="w-full text-red-800">{error}</p>}
      </div>
    );
  }

  if (!eligiendo) {
    return (
      <button type="button" onClick={() => setEligiendo(true)} className="inline-flex h-11 items-center gap-2 rounded-full bg-stone-100 px-4 text-sm font-medium text-stone-700">
        <Pause className="size-4" aria-hidden />
        Pausar pedidos
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-stone-200 bg-white p-4">
      <label className="block">
        <span className="font-medium">Mensaje para los clientes</span>
        <span className="ml-2 text-sm text-muted">Opcional</span>
        <input value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={200} list="mensajes-pausa" className="mt-1 h-12 w-full rounded-xl border border-stone-300 bg-white px-4" />
        <datalist id="mensajes-pausa">
          {MENSAJES.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => cambiar(true)} disabled={enviando} className="h-11 rounded-full bg-amber-900 px-5 font-medium text-white disabled:opacity-60">
          {enviando ? "Pausando…" : "Pausar ahora"}
        </button>
        <button type="button" onClick={() => setEligiendo(false)} className="h-11 rounded-full px-4 font-medium text-stone-700 hover:bg-stone-100">
          Cancelar
        </button>
      </div>
    </div>
  );
}
