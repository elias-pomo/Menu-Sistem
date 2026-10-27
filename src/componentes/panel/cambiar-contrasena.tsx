"use client";

import { useState } from "react";
import { useHidratado } from "@/componentes/use-hidratado";
import { ErrorApi, llamarApi } from "./api";

/** Cambiar la propia contraseña. Cierra las sesiones de otros dispositivos, no la de este. */
export function CambiarContrasena() {
  const hidratado = useHidratado();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setErrores({});
    setMensaje(null);
    if (nueva !== repetida) {
      setErrores({ repetida: "Las dos contraseñas nuevas no coinciden." });
      return;
    }
    setEnviando(true);
    try {
      await llamarApi("POST", "/api/v1/admin/auth/password", { actual, nueva });
      setActual("");
      setNueva("");
      setRepetida("");
      setMensaje({ tipo: "ok", texto: "Listo, cambiaste tu contraseña. Se cerró la sesión en tus otros dispositivos." });
    } catch (err) {
      if (err instanceof ErrorApi) {
        setErrores(err.fields);
        setMensaje({ tipo: "error", texto: err.message });
      } else setMensaje({ tipo: "error", texto: "Ocurrió un error." });
    } finally {
      setEnviando(false);
    }
  }

  const campo = "mt-1 h-12 w-full rounded-xl border border-stone-300 bg-white px-4";
  return (
    <form method="post" noValidate onSubmit={guardar} className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <label className="block">
        <span className="font-medium">Contraseña actual</span>
        <input type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" className={campo} />
        {errores.actual && <p className="mt-1 text-sm text-red-700">{errores.actual}</p>}
      </label>
      <label className="block">
        <span className="font-medium">Contraseña nueva</span>
        <span className="ml-2 text-sm text-muted">Al menos 10 caracteres</span>
        <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" className={campo} />
        {errores.nueva && <p className="mt-1 text-sm text-red-700">{errores.nueva}</p>}
      </label>
      <label className="block">
        <span className="font-medium">Repetí la contraseña nueva</span>
        <input type="password" value={repetida} onChange={(e) => setRepetida(e.target.value)} autoComplete="new-password" className={campo} />
        {errores.repetida && <p className="mt-1 text-sm text-red-700">{errores.repetida}</p>}
      </label>
      {mensaje && (
        <p role={mensaje.tipo === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${mensaje.tipo === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
          {mensaje.texto}
        </p>
      )}
      <button type="submit" disabled={enviando || !hidratado} className="h-12 rounded-full bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-50 sm:self-start">
        {enviando ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
