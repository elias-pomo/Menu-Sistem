import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/bd";
import type { MenuPublico } from "./tipos";

/**
 * Menú público de un negocio (RF-001 a RF-003). Se cachea con una etiqueta por negocio y vida corta:
 * cualquier cambio de menú, precio o disponibilidad llama a `revalidateTag(etiquetaMenu(slug))`.
 * La caché nunca decide un precio: el pedido se valida siempre con datos frescos.
 */

export const etiquetaMenu = (slug: string) => `menu:${slug}`;

export async function obtenerMenuPublico(slug: string): Promise<MenuPublico | null> {
  "use cache";
  cacheTag(etiquetaMenu(slug));
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 });

  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const negocio = await db.business.findUnique({
    where: { slug },
    include: {
      openingHours: { orderBy: [{ weekday: "asc" }, { opensMin: "asc" }] },
      categories: {
        where: { isActive: true, archivedAt: null },
        orderBy: { position: "asc" },
        include: {
          products: {
            where: { isActive: true, archivedAt: null },
            orderBy: { position: "asc" },
            include: {
              optionGroups: {
                where: { group: { archivedAt: null } },
                orderBy: { position: "asc" },
                include: { group: { include: { options: { orderBy: { position: "asc" } } } } },
              },
            },
          },
        },
      },
    },
  });
  if (!negocio) return null;

  return {
    business: {
      slug: negocio.slug,
      name: negocio.name,
      address: negocio.address,
      logoUrl: negocio.logoUrl,
      primaryColor: negocio.primaryColor,
      whatsappE164: negocio.whatsappE164,
      acceptingOrders: negocio.acceptingOrders,
      pauseMessage: negocio.pauseMessage,
      deliveryEnabled: negocio.deliveryEnabled,
      deliveryFeeCents: negocio.deliveryFeeCents,
      minOrderCents: negocio.minOrderCents,
      acceptCash: negocio.acceptCash,
      acceptTransfer: negocio.acceptTransfer,
      showPhotos: negocio.showPhotos,
      showDescriptions: negocio.showDescriptions,
      menuVersion: negocio.menuVersion,
      timezone: negocio.timezone,
      openingHours: negocio.openingHours.map(({ weekday, opensMin, closesMin }) => ({ weekday, opensMin, closesMin })),
    },
    categories: negocio.categories
      .filter((c) => c.products.length > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        products: c.products.map((p) => ({
          id: p.id,
          name: p.name,
          description: negocio.showDescriptions ? p.description : null,
          priceCents: p.priceCents,
          imageUrl: negocio.showPhotos ? p.imageUrl : null,
          tags: p.tags,
          isSoldOut: p.isSoldOut,
          groups: p.optionGroups.map(({ group }) => ({
            id: group.id,
            name: group.name,
            kind: group.kind,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            options: group.options.map((o) => ({
              id: o.id,
              name: o.name,
              priceDeltaCents: group.kind === "REMOVE" ? 0 : o.priceDeltaCents,
              isAvailable: o.isAvailable,
            })),
          })),
        })),
      })),
  };
}
