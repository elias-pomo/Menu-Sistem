/**
 * Roles y permisos (sección 5 del plan). El rol sale siempre de la sesión en el servidor. La matriz es
 * un dato: cada acción tiene un rol mínimo, y los tests la recorren completa.
 */

export const ROLES = ["STAFF", "MANAGER", "OWNER"] as const;
export type Rol = (typeof ROLES)[number];

const JERARQUIA: Record<Rol, number> = { STAFF: 1, MANAGER: 2, OWNER: 3 };

export function tieneRolMinimo(rol: Rol, minimo: Rol): boolean {
  return JERARQUIA[rol] >= JERARQUIA[minimo];
}

export const PERMISOS = {
  "pedidos.ver": "STAFF",
  "pedidos.cambiarEstado": "STAFF",
  "pedidos.cancelar": "STAFF",
  "pedidos.marcarCobrado": "STAFF",
  "pedidos.retroceder": "MANAGER",
  "productos.disponibilidad": "STAFF",
  "negocio.pausar": "STAFF",
  "menu.editar": "MANAGER",
  "menu.precios": "MANAGER",
  "negocio.horarios": "MANAGER",
  "negocio.datos": "MANAGER",
  "metricas.ver": "MANAGER",
  "negocio.envioYPagos": "OWNER",
  "auditoria.ver": "OWNER",
  "usuarios.gestionar": "OWNER",
  "pedidos.anonimizar": "OWNER",
} as const satisfies Record<string, Rol>;

export type Permiso = keyof typeof PERMISOS;

export function puede(rol: Rol, permiso: Permiso): boolean {
  return tieneRolMinimo(rol, PERMISOS[permiso]);
}
