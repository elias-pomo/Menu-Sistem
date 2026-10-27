"use client";

import { MessageCircle } from "lucide-react";
import { useState } from "react";
import type { PedidoPanel } from "@/modulos/pedidos";
import { enlaceWhatsApp, mensajeParaCliente, type NegocioParaMensaje } from "@/modulos/whatsapp";

export type NegocioPanel = NegocioParaMensaje & { slug: string };

/**
 * Abre WhatsApp con el chat del cliente y el mensaje del estado actual ya escrito (RF-027). El
 * sistema no sabe si se envió: dice "Mensaje preparado" y registra que se abrió.
 */
export function BotonWhatsapp({ pedido, negocio, grande = false, onAbierto }: { pedido: PedidoPanel; negocio: NegocioPanel; grande?: boolean; onAbierto?: (at: string) => void }) {
  const [preparado, setPreparado] = useState<string | null>(null);
  if (!pedido.customerPhone) return null;
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/${negocio.slug}/pedido/${pedido.publicToken}`;
  const texto = mensajeParaCliente(pedido, negocio, url);
  if (!texto) return null;

  function registrar() {
    // keepalive: el pedido sale aunque el navegador pase a WhatsApp enseguida.
    fetch(`/api/v1/admin/orders/${pedido.id}/whatsapp`, { method: "POST", keepalive: true })
      .then((r) => (r.ok ? r.json() : null))
      .then((r: { at: string } | null) => r && onAbierto?.(r.at))
      .catch(() => {});
    setPreparado(pedido.status);
  }

  const listo = preparado === pedido.status;
  return (
    <a
      href={enlaceWhatsApp(pedido.customerPhone, texto)}
      target="_blank"
      rel="noreferrer"
      onClick={registrar}
      className={`inline-flex items-center justify-center gap-2 rounded-full border font-medium ${grande ? "h-12 px-5" : "h-11 px-4 text-sm"} ${listo ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-emerald-700 text-emerald-800"}`}
    >
      <MessageCircle className="size-4" aria-hidden />
      {listo ? "Mensaje preparado" : "WhatsApp"}
    </a>
  );
}
