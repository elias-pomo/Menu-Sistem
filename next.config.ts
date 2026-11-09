import type { NextConfig } from "next";

const desarrollo = process.env.NODE_ENV === "development";
// Las previews de Vercel inyectan la barra de comentarios desde vercel.live.
const vercelLive = process.env.VERCEL_ENV === "preview" ? " https://vercel.live" : "";

/**
 * CSP sin nonces (sección 17 del plan): el menú público usa prerender parcial con `cacheComponents` y un
 * nonce obligaría a renderizar todo por solicitud. Next mete scripts en línea para el payload de RSC,
 * así que `script-src` necesita 'unsafe-inline'; React escapa todo lo que se muestra y no hay
 * `dangerouslySetInnerHTML`. Lo que sí se cierra: orígenes de scripts, conexiones, imágenes (solo
 * Vercel Blob), formularios, `<base>`, plugins y marcos.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${desarrollo ? " 'unsafe-eval'" : ""}${vercelLive}`,
  "style-src 'self' 'unsafe-inline'", // atributos style del color del local y las barras de métricas
  "img-src 'self' blob: data: https://*.public.blob.vercel-storage.com",
  "font-src 'self'",
  `connect-src 'self'${vercelLive}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  `frame-src ${vercelLive ? vercelLive.trim() : "'none'"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(desarrollo ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Fotos y logos que suben los locales (Vercel Blob). Sus URLs no cambian nunca: caché larga.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/negocios/**" }],
    qualities: [75],
    minimumCacheTTL: 2_678_400,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        // El navegador tiene que ver siempre la última versión del service worker del panel.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
