import type { MetadataRoute } from "next";

/**
 * Manifest de la PWA del panel. Va fuera de /admin para que el navegador lo pueda leer sin sesión (lo
 * pide sin cookies) y no lo enlaza el menú público: lo que se instala es el panel, no el menú.
 */
const manifest: MetadataRoute.Manifest = {
  id: "/admin",
  name: "Panel de pedidos",
  short_name: "Pedidos",
  description: "Pedidos del local en tiempo real, con aviso de pedido nuevo.",
  start_url: "/admin",
  scope: "/admin",
  display: "standalone",
  orientation: "portrait",
  lang: "es-AR",
  background_color: "#fafaf9",
  theme_color: "#c2410c",
  icons: [
    { src: "/panel/icono-192.png", sizes: "192x192", type: "image/png" },
    { src: "/panel/icono-512.png", sizes: "512x512", type: "image/png" },
    { src: "/panel/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export function GET() {
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
