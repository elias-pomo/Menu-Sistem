import { describe, expect, it } from "vitest";
import { verificarEscritura, verificarOrigen } from "@/lib/http";
import { detectarTipoImagen } from "@/lib/imagenes";
import { Grupo, Producto } from "@/modulos/menu/esquemas";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

describe("tipo de imagen por contenido", () => {
  it("reconoce WebP, JPEG y PNG por sus primeros bytes", () => {
    expect(detectarTipoImagen(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
    expect(detectarTipoImagen(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectarTipoImagen(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
  });

  it("rechaza un ejecutable renombrado, un SVG o un archivo vacío", () => {
    expect(detectarTipoImagen(bytes(0x4d, 0x5a))).toBeNull(); // MZ: .exe
    expect(detectarTipoImagen(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(detectarTipoImagen(new Uint8Array())).toBeNull();
    // RIFF que no es WebP (por ejemplo, un WAV).
    expect(detectarTipoImagen(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBeNull();
  });
});

describe("escrituras: JSON y mismo origen (CSRF)", () => {
  const pedido = (headers: Record<string, string>) => new Request("http://localhost:3000/api/v1/admin/categories", { method: "POST", headers });

  it("acepta JSON desde el propio origen", () => {
    expect(() => verificarEscritura(pedido({ "content-type": "application/json", origin: "http://localhost:3000", host: "localhost:3000" }))).not.toThrow();
  });

  it("rechaza otro origen, sin origen o sin JSON", () => {
    expect(() => verificarEscritura(pedido({ "content-type": "application/json", origin: "https://malo.com", host: "localhost:3000" }))).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(() => verificarOrigen(pedido({ host: "localhost:3000" }))).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => verificarEscritura(pedido({ "content-type": "text/plain", origin: "http://localhost:3000", host: "localhost:3000" }))).toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });

  it("detrás del proxy de Vercel compara contra x-forwarded-host", () => {
    expect(() =>
      verificarOrigen(pedido({ origin: "https://ecovex-menu-sistem.vercel.app", host: "interno", "x-forwarded-host": "ecovex-menu-sistem.vercel.app" })),
    ).not.toThrow();
  });
});

describe("esquemas del menú", () => {
  const base = { categoryId: "8c1f0b8e-7a3d-4d7e-9a51-0c1d2e3f4a5b", name: "Flan", priceCents: 350_000 };

  it("solo acepta fotos subidas a Vercel Blob por https", () => {
    expect(Producto.safeParse({ ...base, imageUrl: "https://abc.public.blob.vercel-storage.com/x.webp" }).success).toBe(true);
    expect(Producto.safeParse({ ...base, imageUrl: "https://otro-sitio.com/x.webp" }).success).toBe(false);
    expect(Producto.safeParse({ ...base, imageUrl: "http://abc.public.blob.vercel-storage.com/x.webp" }).success).toBe(false);
    expect(Producto.safeParse({ ...base, imageUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("precio en centavos enteros y no negativos; rechaza campos desconocidos", () => {
    expect(Producto.safeParse({ ...base, priceCents: 10.5 }).success).toBe(false);
    expect(Producto.safeParse({ ...base, priceCents: -1 }).success).toBe(false);
    expect(Producto.safeParse({ ...base, businessId: "otro" }).success).toBe(false);
  });

  it("un grupo exige máximo ≥ mínimo y suficientes opciones disponibles", () => {
    const opcion = { name: "Simple", priceDeltaCents: 0, isAvailable: true };
    expect(Grupo.safeParse({ name: "Tamaño", kind: "CHOICE", minSelect: 1, maxSelect: 1, options: [opcion] }).success).toBe(true);
    expect(Grupo.safeParse({ name: "Tamaño", kind: "CHOICE", minSelect: 2, maxSelect: 1, options: [opcion, opcion] }).success).toBe(false);
    expect(Grupo.safeParse({ name: "Tamaño", kind: "CHOICE", minSelect: 1, maxSelect: 1, options: [{ ...opcion, isAvailable: false }] }).success).toBe(false);
    expect(Grupo.safeParse({ name: "Tamaño", kind: "CHOICE", minSelect: 0, maxSelect: 1, options: [] }).success).toBe(false);
  });
});
