/** Esqueleto mientras se lee el menú. */
export function CargandoMenu() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse px-4 pt-6" aria-busy="true" aria-label="Cargando el menú">
      <div className="flex items-center gap-3">
        <div className="size-14 rounded-2xl bg-stone-200" />
        <div className="h-7 w-48 rounded-lg bg-stone-200" />
      </div>
      <div className="mt-6 flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-stone-200" />
        ))}
      </div>
    </div>
  );
}
