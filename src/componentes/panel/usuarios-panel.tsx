"use client";

import { Copy, KeyRound, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHidratado } from "@/componentes/use-hidratado";
import type { Rol } from "@/modulos/autenticacion/permisos";
import { ErrorApi, llamarApi } from "./api";

/** Usuarios del local (RF-037). Solo lo ve el dueño; el servidor aplica RN-20 y el resto de las reglas. */

export type UsuarioLista = { id: string; name: string; email: string; role: Rol; isActive: boolean; lastLoginAt: string | null };

const ROLES: { valor: Rol; nombre: string; detalle: string }[] = [
  { valor: "STAFF", nombre: "Personal", detalle: "Pedidos, agotados y pausa." },
  { valor: "MANAGER", nombre: "Encargado", detalle: "Además: menú, precios, datos del local y horarios." },
  { valor: "OWNER", nombre: "Dueño", detalle: "Todo: envío y pagos, usuarios e historial." },
];
const NOMBRE_ROL = Object.fromEntries(ROLES.map((r) => [r.valor, r.nombre])) as Record<Rol, string>;

const CAMPO = "h-12 w-full rounded-xl border border-stone-300 bg-white px-4";

/** La contraseña temporal se muestra una sola vez, con botón para copiarla. */
function ContrasenaTemporal({ email, contrasena, onCerrar }: { email: string; contrasena: string; onCerrar: () => void }) {
  const [copiada, setCopiada] = useState(false);
  return (
    <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
      <p className="font-medium">Contraseña temporal para {email}</p>
      <p className="mt-1 text-sm">Pasásela a la persona: es la única vez que se muestra. Después puede cambiarla en Ajustes.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code aria-label="Contraseña temporal" className="rounded-xl bg-white px-4 py-3 font-mono text-lg tracking-wide">
          {contrasena}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(contrasena).catch(() => {});
            setCopiada(true);
          }}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium"
        >
          <Copy className="size-4" aria-hidden />
          {copiada ? "Copiada" : "Copiar"}
        </button>
        <button type="button" onClick={onCerrar} className="h-11 rounded-full px-4 text-sm font-medium hover:bg-emerald-100">
          Listo
        </button>
      </div>
    </div>
  );
}

export function UsuariosPanel({ usuarios, yo }: { usuarios: UsuarioLista[]; yo: string }) {
  const router = useRouter();
  const hidratado = useHidratado();
  const [creando, setCreando] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Rol>("STAFF");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [temporal, setTemporal] = useState<{ email: string; contrasena: string } | null>(null);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    setGeneral("");
    try {
      const r = await llamarApi<{ user: UsuarioLista; temporaryPassword: string }>("POST", "/api/v1/admin/users", { name, email, role });
      setTemporal({ email: r.user.email, contrasena: r.temporaryPassword });
      setCreando(false);
      setName("");
      setEmail("");
      setRole("STAFF");
      router.refresh();
    } catch (err) {
      if (err instanceof ErrorApi) {
        setErrores(err.fields);
        setGeneral(err.message);
      } else setGeneral("Ocurrió un error.");
    } finally {
      setEnviando(false);
    }
  }

  async function accion(llamada: () => Promise<unknown>) {
    setGeneral("");
    try {
      await llamada();
      router.refresh();
    } catch (err) {
      setGeneral(err instanceof ErrorApi ? err.message : "Ocurrió un error.");
    }
  }

  const cambiar = (u: UsuarioLista, cambios: Partial<Pick<UsuarioLista, "role" | "isActive">>) => accion(() => llamarApi("PATCH", `/api/v1/admin/users/${u.id}`, cambios));

  async function restablecer(u: UsuarioLista) {
    if (!window.confirm(`¿Darle una contraseña nueva a ${u.name}? La actual deja de funcionar y se cierran sus sesiones.`)) return;
    await accion(async () => {
      const r = await llamarApi<{ temporaryPassword: string }>("POST", `/api/v1/admin/users/${u.id}/password`);
      setTemporal({ email: u.email, contrasena: r.temporaryPassword });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {temporal && <ContrasenaTemporal email={temporal.email} contrasena={temporal.contrasena} onCerrar={() => setTemporal(null)} />}
      {general && !creando && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {general}
        </p>
      )}

      {creando ? (
        <form method="post" noValidate onSubmit={crear} className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
          <h2 className="text-lg font-bold">Nuevo usuario</h2>
          {general && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
              {general}
            </p>
          )}
          <label className="block">
            <span className="font-medium">Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`mt-1 ${CAMPO}`} />
            {errores.name && <p className="mt-1 text-sm text-red-700">{errores.name}</p>}
          </label>
          <label className="block">
            <span className="font-medium">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" autoCapitalize="none" className={`mt-1 ${CAMPO}`} />
            {errores.email && <p className="mt-1 text-sm text-red-700">{errores.email}</p>}
          </label>
          <fieldset>
            <legend className="font-medium">Rol</legend>
            <div className="mt-1 divide-y divide-stone-100 rounded-xl border border-stone-200">
              {ROLES.map((r) => (
                <label key={r.valor} className="flex min-h-12 cursor-pointer items-start gap-3 px-4 py-2">
                  <input type="radio" name="rol" checked={role === r.valor} onChange={() => setRole(r.valor)} className="mt-1 size-5 accent-[var(--primary)]" />
                  <span>
                    {r.nombre}
                    <span className="block text-sm text-muted">{r.detalle}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={enviando || !hidratado} className="h-12 flex-1 rounded-full bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-50 sm:flex-none">
              {enviando ? "Creando…" : "Crear usuario"}
            </button>
            <button type="button" onClick={() => setCreando(false)} className="h-12 rounded-full px-5 font-medium text-stone-700 hover:bg-stone-100">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setCreando(true)} className="inline-flex h-12 items-center justify-center gap-2 self-start rounded-full bg-primary px-5 font-semibold text-primary-foreground">
          <UserPlus className="size-5" aria-hidden />
          Nuevo usuario
        </button>
      )}

      <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
        {usuarios.map((u) => {
          const soyYo = u.id === yo;
          return (
            <li key={u.id} aria-label={u.name} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${u.isActive ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {u.name}
                  {soyYo && <span className="ml-2 text-sm font-normal text-muted">(vos)</span>}
                  {!u.isActive && <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium">Desactivado</span>}
                </p>
                <p className="truncate text-sm text-muted">{u.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Rol de ${u.name}`}
                  value={u.role}
                  disabled={soyYo || !u.isActive}
                  onChange={(e) => cambiar(u, { role: e.target.value as Rol })}
                  className="h-11 rounded-xl border border-stone-300 bg-white px-3 disabled:bg-stone-50"
                >
                  {ROLES.map((r) => (
                    <option key={r.valor} value={r.valor}>
                      {NOMBRE_ROL[r.valor]}
                    </option>
                  ))}
                </select>
                {!soyYo && u.isActive && (
                  <button type="button" onClick={() => restablecer(u)} aria-label={`Contraseña nueva para ${u.name}`} className="grid size-11 place-items-center rounded-full text-stone-600 hover:bg-stone-100">
                    <KeyRound className="size-5" aria-hidden />
                  </button>
                )}
                {!soyYo && (
                  <button
                    type="button"
                    onClick={() => {
                      if (u.isActive && !window.confirm(`¿Desactivar a ${u.name}? Se cierra su sesión y deja de recibir avisos.`)) return;
                      cambiar(u, { isActive: !u.isActive });
                    }}
                    className={`h-11 rounded-full px-4 text-sm font-medium ${u.isActive ? "border border-red-200 text-red-700" : "bg-stone-100 text-stone-700"}`}
                  >
                    {u.isActive ? "Desactivar" : "Reactivar"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
