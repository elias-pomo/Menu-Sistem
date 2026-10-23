"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorApi, llamarApi } from "@/componentes/panel/api";
import { useHidratado } from "@/componentes/use-hidratado";

export function FormularioIngreso() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const hidratado = useHidratado();

  return (
    <form
      // POST: si se llegara a enviar antes de hidratar, la contraseña nunca va en la URL.
      method="post"
      className="mt-6 flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        setEnviando(true);
        setError("");
        try {
          await llamarApi("POST", "/api/v1/admin/auth/login", { email: datos.get("email"), password: datos.get("password") });
          router.replace("/admin/menu");
          router.refresh();
        } catch (err) {
          setError(err instanceof ErrorApi ? err.message : "Ocurrió un error.");
          setEnviando(false);
        }
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-medium">Email</span>
        <input name="email" type="email" autoComplete="username" required className="h-12 rounded-xl border border-stone-300 bg-white px-4" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 rounded-xl border border-stone-300 bg-white px-4"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={enviando || !hidratado} className="h-12 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-50">
        {enviando ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
