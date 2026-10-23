import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { db } from "@/lib/bd";
import { AppError } from "@/lib/errores";
import { manejar, verificarOrigen } from "@/lib/http";
import { detectarTipoImagen, extensionDe, MAX_BYTES_IMAGEN } from "@/lib/imagenes";
import { registrarAuditoria } from "@/modulos/auditoria";
import { requerirRol } from "@/modulos/autenticacion";

/**
 * Subida de una foto de producto (ADR-006). El navegador ya la comprimió a WebP (≤ 1600 px, sin
 * metadatos EXIF); acá se verifica sesión, rol, tamaño y tipo por contenido, y se guarda en Vercel
 * Blob en una carpeta del negocio de la sesión. Devuelve la URL pública.
 */
export async function POST(request: Request) {
  return manejar(async () => {
    verificarOrigen(request);
    const sesion = await requerirRol("MANAGER");
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new AppError("SERVICE_UNAVAILABLE", "Falta configurar el almacenamiento de fotos (Vercel Blob).");
    }

    const declarado = Number(request.headers.get("content-length") ?? 0);
    if (declarado > MAX_BYTES_IMAGEN) throw new AppError("PAYLOAD_TOO_LARGE", "La foto pesa más de 5 MB.");
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length === 0) throw new AppError("VALIDATION_ERROR", "No llegó ninguna foto.");
    if (bytes.length > MAX_BYTES_IMAGEN) throw new AppError("PAYLOAD_TOO_LARGE", "La foto pesa más de 5 MB.");

    const tipo = detectarTipoImagen(bytes);
    if (!tipo) throw new AppError("UNSUPPORTED_MEDIA_TYPE", "El archivo no es una imagen WebP, JPEG o PNG.");

    const ruta = `negocios/${sesion.businessId}/productos/${randomUUID()}.${extensionDe(tipo)}`;
    const blob = await put(ruta, Buffer.from(bytes), {
      access: "public",
      contentType: tipo,
      addRandomSuffix: false,
      cacheControlMaxAge: 31_536_000,
    });
    await registrarAuditoria(db, {
      businessId: sesion.businessId,
      userId: sesion.userId,
      action: "image.uploaded",
      entityType: "image",
      entityId: null,
      after: { url: blob.url, bytes: bytes.length, tipo },
    });
    return Response.json({ url: blob.url }, { status: 201 });
  });
}
