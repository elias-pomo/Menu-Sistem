import Link from "next/link";

export default function NoEncontrado() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold">No encontramos esta página</h1>
      <p className="text-muted">Revisá el link que te pasaron.</p>
      <Link href="/" className="mt-2 font-medium underline">
        Ir al inicio
      </Link>
    </main>
  );
}
