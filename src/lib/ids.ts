const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un ID que no es UUID ni se consulta: la respuesta es la misma que para uno inexistente. */
export function esUuid(valor: string): boolean {
  return UUID.test(valor);
}
