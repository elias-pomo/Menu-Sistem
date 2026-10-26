import type { Metadata, Viewport } from "next";

/** Todo /admin (ingreso y panel) enlaza el manifest: el panel se instala como app (PWA). */
export const metadata: Metadata = {
  manifest: "/panel.webmanifest",
  appleWebApp: { capable: true, title: "Pedidos", statusBarStyle: "default" },
  icons: { apple: "/panel/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#c2410c" };

export default function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  return children;
}
