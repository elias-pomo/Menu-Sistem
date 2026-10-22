/**
 * Prueba de humo contra la base de producción (Neon): lee el menú del piloto, calcula un pedido con el
 * mismo módulo que usa la app e inicia y cierra sesión con el dueño. No crea pedidos.
 *
 *   npm run prod:smoke
 */
import { db } from "@/lib/bd";
import { cerrarSesion, iniciarSesion, validarSesion } from "@/modulos/autenticacion";
import { cargarProductosParaPedido } from "@/modulos/menu";
import { obtenerNegocioPorSlug } from "@/modulos/negocio";
import { calcularPedido } from "@/modulos/pedidos";

function verificar(condicion: unknown, mensaje: string) {
  if (!condicion) throw new Error(`FALLÓ: ${mensaje}`);
  console.log(`ok  ${mensaje}`);
}

async function main() {
  const negocio = await obtenerNegocioPorSlug("hawkens-food");
  verificar(negocio, "el negocio hawkens-food existe");
  if (!negocio) return;

  const productos = await db.product.findMany({ where: { businessId: negocio.id } });
  const milanesa = productos.find((p) => p.name === "Sándwich de milanesa")!;
  const cheesse = productos.find((p) => p.name === "Cheesse")!;
  const opcion = (name: string) => db.option.findFirstOrThrow({ where: { businessId: negocio.id, name } });
  const [conPapas, cheddar, triple] = await Promise.all([opcion("Común con papas"), opcion("Cheddar"), opcion("Triple")]);

  const menu = await cargarProductosParaPedido(db, negocio.id, [milanesa.id, cheesse.id]);
  verificar(menu.size === 2, "el menú se lee con grupos y opciones");

  const calculo = calcularPedido(
    {
      fulfillment: "DELIVERY",
      paymentMethod: "CASH",
      items: [
        { productId: milanesa.id, quantity: 1, optionIds: [conPapas.id, cheddar.id], note: null },
        { productId: cheesse.id, quantity: 1, optionIds: [triple.id], note: null },
      ],
    },
    menu,
    negocio,
  );
  // Milanesa común con papas ($10.000) + cheddar ($1.000) + Cheesse triple ($11.000) + envío ($1.500).
  verificar(calculo.ok && calculo.totalCents === 2_350_000, `el pedido calcula $23.500 (${calculo.ok ? calculo.totalCents / 100 : "error"})`);

  const email = process.env.PILOTO_OWNER_EMAIL ?? "";
  const { token } = await iniciarSesion({ email, password: process.env.PILOTO_OWNER_PASSWORD ?? "", ip: null, userAgent: "prod-smoke" });
  const sesion = await validarSesion(token);
  verificar(sesion?.role === "OWNER" && sesion.businessId === negocio.id, "el dueño inicia sesión y la sesión es de su negocio");
  await cerrarSesion(token);
  verificar((await validarSesion(token)) === null, "cerrar sesión la invalida");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
