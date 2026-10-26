"use client";

import { BellRing, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { activarAvisos, desactivarAvisos, estadoAvisos, type EstadoAvisos } from "./avisos-push";

const ETIQUETA: Record<EstadoAvisos, string> = {
  cargando: "Avisos",
  "no-soportado": "Avisos no disponibles",
  "instalar-en-iphone": "Instalá el panel",
  bloqueado: "Avisos bloqueados",
  inactivo: "Activar avisos",
  activo: "Avisos activados",
};

/**
 * Avisos push con el panel cerrado o el celular bloqueado. Es un respaldo del sonido y del polling:
 * sin clave configurada en el servidor no se muestra.
 */
export function BotonAvisos({ clavePublica }: { clavePublica: string | null }) {
  const [estado, setEstado] = useState<EstadoAvisos>("cargando");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clavePublica) return;
    let vigente = true;
    estadoAvisos()
      .then((e) => vigente && setEstado(e))
      .catch(() => vigente && setEstado("no-soportado"));
    return () => {
      vigente = false;
    };
  }, [clavePublica]);

  if (!clavePublica || estado === "no-soportado") return null;
  if (estado === "instalar-en-iphone") {
    return (
      <p className="flex w-full items-start gap-2 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
        <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
        Para recibir avisos en iPhone, instalá el panel: tocá Compartir y después “Agregar a inicio”. Abrilo desde ese ícono y activá los avisos.
      </p>
    );
  }

  async function alternar() {
    setError("");
    try {
      if (estado === "activo") {
        await desactivarAvisos();
        setEstado("inactivo");
      } else setEstado(await activarAvisos(clavePublica!));
    } catch {
      setError("No se pudieron activar los avisos. Probá de nuevo.");
    }
  }

  const activo = estado === "activo";
  return (
    <>
      <button
        type="button"
        onClick={alternar}
        disabled={estado === "cargando" || estado === "bloqueado"}
        aria-pressed={activo}
        className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium disabled:opacity-60 ${activo ? "bg-emerald-50 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
      >
        <BellRing className="size-4" aria-hidden />
        {ETIQUETA[estado]}
      </button>
      {estado === "bloqueado" && (
        <p className="w-full rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
          Las notificaciones están bloqueadas para este sitio. Habilitalas en la configuración del navegador.
        </p>
      )}
      {error && (
        <p role="alert" className="w-full rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </>
  );
}
