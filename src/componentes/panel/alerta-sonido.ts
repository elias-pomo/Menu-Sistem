"use client";

/**
 * Sonido de pedido nuevo con Web Audio (sin archivos). Los navegadores solo dejan sonar después de
 * un toque del usuario: por eso el panel tiene el botón "Activar sonido" (riesgo R11 del plan).
 */

let contexto: AudioContext | null = null;

export async function activarSonido(): Promise<boolean> {
  try {
    contexto ??= new AudioContext();
    if (contexto.state === "suspended") await contexto.resume();
    return contexto.state === "running";
  } catch {
    return false;
  }
}

export function sonidoActivo(): boolean {
  return contexto?.state === "running";
}

/** Tres pitidos cortos y vibración, si el dispositivo la tiene. */
export function sonarPedidoNuevo() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
  if (!contexto || contexto.state !== "running") return;
  const inicio = contexto.currentTime;
  for (let i = 0; i < 3; i++) {
    const oscilador = contexto.createOscillator();
    const volumen = contexto.createGain();
    oscilador.type = "sine";
    oscilador.frequency.value = i === 2 ? 1175 : 880;
    volumen.gain.setValueAtTime(0.0001, inicio + i * 0.25);
    volumen.gain.exponentialRampToValueAtTime(0.4, inicio + i * 0.25 + 0.02);
    volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + i * 0.25 + 0.2);
    oscilador.connect(volumen).connect(contexto.destination);
    oscilador.start(inicio + i * 0.25);
    oscilador.stop(inicio + i * 0.25 + 0.22);
  }
}
