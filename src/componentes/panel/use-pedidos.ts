"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PedidoPanel } from "@/modulos/pedidos";
import { sonarPedidoNuevo } from "./alerta-sonido";
import type { NegocioPanel } from "./boton-whatsapp";

/**
 * Pedidos del panel con consulta periódica (ADR-005): cada 5 s con la pestaña visible y pedidos
 * activos; cada 10 s si no hay activos o la pestaña está oculta. Con el cursor solo bajan los cambios.
 */

const RAPIDO_MS = 5_000;
const LENTO_MS = 10_000;
const ACTIVOS = ["PENDING", "CONFIRMED", "PREPARING", "READY", "ON_THE_WAY"];

type Respuesta = {
  cursor: string;
  orders: PedidoPanel[];
  resumen: { recibidos: number; entregados: number; cancelados: number; ventasCents: number };
  config: { pendingAlertMinutes: number; acceptingOrders: boolean; negocio: NegocioPanel | null };
};

/**
 * Una respuesta del polling que salió antes de una acción puede llegar después: nunca reemplaza un
 * pedido por una versión más vieja.
 */
function guardarSiEsMasNuevo(mapa: Map<string, PedidoPanel>, pedido: PedidoPanel) {
  const actual = mapa.get(pedido.id);
  if (!actual || pedido.updatedAt >= actual.updatedAt) mapa.set(pedido.id, pedido);
  return mapa;
}

export function usePedidos() {
  const [pedidos, setPedidos] = useState<Map<string, PedidoPanel>>(new Map());
  const [resumen, setResumen] = useState<Respuesta["resumen"] | null>(null);
  const [config, setConfig] = useState<Respuesta["config"]>({ pendingAlertMinutes: 15, acceptingOrders: true, negocio: null });
  const [ultimaActualizacion, setUltima] = useState<Date | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const cursor = useRef<string | null>(null);
  const vistos = useRef<Set<string> | null>(null);
  // Último estado conocido, para elegir el intervalo sin reiniciar el ciclo en cada cambio.
  const pedidosRef = useRef(pedidos);
  useEffect(() => {
    pedidosRef.current = pedidos;
  }, [pedidos]);

  const consultar = useCallback(async () => {
    try {
      const url = cursor.current ? `/api/v1/admin/orders?since=${encodeURIComponent(cursor.current)}` : "/api/v1/admin/orders";
      const r = await fetch(url, { cache: "no-store" });
      if (r.status === 401) {
        window.location.assign("/admin/ingresar"); // eslint-disable-line @next/next/no-location-assign-relative-destination -- recarga completa a propósito
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const datos = (await r.json()) as Respuesta;
      cursor.current = datos.cursor;

      // Pedido nuevo = un PENDING que no se había visto. En la primera carga no suena.
      const primera = vistos.current === null;
      vistos.current ??= new Set();
      const nuevos = datos.orders.filter((p) => p.status === "PENDING" && !vistos.current!.has(p.id));
      datos.orders.forEach((p) => vistos.current!.add(p.id));
      if (!primera && nuevos.length) sonarPedidoNuevo();

      setPedidos((anterior) => {
        const siguiente = new Map(anterior);
        datos.orders.forEach((p) => guardarSiEsMasNuevo(siguiente, p));
        return siguiente;
      });
      setResumen(datos.resumen);
      setConfig(datos.config);
      setUltima(new Date());
      setSinConexion(false);
    } catch {
      setSinConexion(true);
    }
  }, []);

  /** Reemplaza un pedido con la respuesta de una acción (sin esperar al próximo ciclo). */
  const actualizarPedido = useCallback((pedido: PedidoPanel) => {
    vistos.current?.add(pedido.id);
    setPedidos((anterior) => guardarSiEsMasNuevo(new Map(anterior), pedido));
  }, []);

  useEffect(() => {
    let temporizador: number;
    let activo = true;
    const ciclo = async () => {
      await consultar();
      if (!activo) return;
      const hayActivos = [...pedidosRef.current.values()].some((p) => ACTIVOS.includes(p.status));
      const espera = document.visibilityState === "visible" && hayActivos ? RAPIDO_MS : LENTO_MS;
      temporizador = window.setTimeout(ciclo, espera);
    };
    ciclo();
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(temporizador);
      ciclo();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alVolver);
    return () => {
      activo = false;
      window.clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alVolver);
    };
  }, [consultar]);

  return { pedidos: [...pedidos.values()], resumen, config, ultimaActualizacion, sinConexion, actualizarPedido, consultar };
}
