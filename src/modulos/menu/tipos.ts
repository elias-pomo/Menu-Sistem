import type { ProductoMenu, TipoGrupo } from "@/modulos/pedidos/calculo";

/**
 * Menú público tal como lo recibe el navegador. Solo datos que se pueden mostrar a cualquiera: sin
 * IDs de negocio, sin productos archivados ni categorías inactivas. Archivo puro (lo usa el cliente).
 */

export type OpcionPublica = { id: string; name: string; priceDeltaCents: number; isAvailable: boolean };

export type GrupoPublico = {
  id: string;
  name: string;
  kind: TipoGrupo;
  minSelect: number;
  maxSelect: number;
  options: OpcionPublica[];
};

export type ProductoPublico = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  tags: string[];
  isSoldOut: boolean;
  groups: GrupoPublico[];
};

export type CategoriaPublica = { id: string; name: string; products: ProductoPublico[] };

export type NegocioPublico = {
  slug: string;
  name: string;
  address: string | null;
  logoUrl: string | null;
  primaryColor: string;
  whatsappE164: string | null;
  acceptingOrders: boolean;
  pauseMessage: string | null;
  deliveryEnabled: boolean;
  deliveryFeeCents: number;
  minOrderCents: number;
  acceptCash: boolean;
  acceptTransfer: boolean;
  showPhotos: boolean;
  showDescriptions: boolean;
  menuVersion: number;
  timezone: string;
  openingHours: { weekday: number; opensMin: number; closesMin: number }[];
};

export type MenuPublico = { business: NegocioPublico; categories: CategoriaPublica[] };

/** Productos del menú público en el formato del módulo de cálculo (todos los que se ven son pedibles). */
export function productosParaCalculo(menu: MenuPublico): Map<string, ProductoMenu> {
  return new Map(
    menu.categories.flatMap((categoria) =>
      categoria.products.map((p): [string, ProductoMenu] => [
        p.id,
        {
          id: p.id,
          name: p.name,
          categoryName: categoria.name,
          priceCents: p.priceCents,
          isOrderable: true,
          isSoldOut: p.isSoldOut,
          groups: p.groups,
        },
      ]),
    ),
  );
}
