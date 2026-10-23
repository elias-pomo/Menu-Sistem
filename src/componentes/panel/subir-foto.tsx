"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { LADO_MAXIMO_IMAGEN, MAX_BYTES_IMAGEN } from "@/lib/imagenes";

/**
 * Elige una foto, la achica a WebP (lado mayor ≤ 1600 px) en el navegador y la sube. Volver a
 * dibujarla en un canvas también elimina los metadatos EXIF (incluida la ubicación).
 */
async function comprimir(archivo: File): Promise<Blob> {
  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO_IMAGEN / Math.max(imagen.width, imagen.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(imagen.width * escala);
  canvas.height = Math.round(imagen.height * escala);
  canvas.getContext("2d")!.drawImage(imagen, 0, 0, canvas.width, canvas.height);
  imagen.close();
  return new Promise((resolver, rechazar) =>
    canvas.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error("No se pudo procesar la imagen."))), "image/webp", 0.82),
  );
}

export function SubirFoto({ url, onCambio }: { url: string | null; onCambio: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<"listo" | "subiendo">("listo");
  const [error, setError] = useState("");

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setError("");
    if (archivo.size > MAX_BYTES_IMAGEN * 4) {
      setError("La foto es demasiado grande.");
      return;
    }
    setEstado("subiendo");
    try {
      const comprimida = await comprimir(archivo);
      const respuesta = await fetch("/api/v1/admin/uploads/image", { method: "POST", headers: { "Content-Type": comprimida.type }, body: comprimida });
      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok) throw new Error(datos?.error?.message ?? "No se pudo subir la foto.");
      onCambio(datos.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setEstado("listo");
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- vista previa de la foto subida
        <img src={url} alt="Foto del producto" className="size-24 rounded-2xl object-cover" />
      ) : (
        <div className="grid size-24 place-items-center rounded-2xl border border-dashed border-stone-300 text-stone-400">
          <ImagePlus className="size-7" aria-hidden />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <label className="inline-flex h-11 cursor-pointer items-center rounded-full border border-stone-300 px-4 text-sm font-medium">
          {estado === "subiendo" ? "Subiendo…" : url ? "Cambiar foto" : "Elegir foto"}
          <input
            ref={input}
            type="file"
            accept="image/webp,image/jpeg,image/png"
            disabled={estado === "subiendo"}
            onChange={(e) => elegir(e.target.files?.[0])}
            className="sr-only"
          />
        </label>
        {url && (
          <button type="button" onClick={() => onCambio(null)} className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm text-red-700 hover:bg-red-50">
            <Trash2 className="size-4" aria-hidden />
            Quitar
          </button>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
