"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** Route-level fallback. Error details stay out of the UI; only the opaque digest is shown for support. */
export default function AppError({ error, reset }: ErrorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const digest = typeof error.digest === "string" && /^[\w-]{1,64}$/.test(error.digest) ? error.digest : null;

  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div className="w-full min-w-0 px-4 py-10 sm:px-6 lg:px-10 lg:py-16">
      <section aria-labelledby="app-error-title" aria-busy={pending} className="mx-auto max-w-3xl rounded-[26px] border bg-card p-6 sm:p-10 shadow-[var(--em-shadow-card)]">
        <div role="alert">
          <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-brand">
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-brand">Algo saiu do previsto</p>
          <h1 id="app-error-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Não foi possível carregar esta página</h1>
          <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
            Pode ter sido uma instabilidade momentânea. Tente novamente; se continuar, volte à agenda e explore outros eventos.
          </p>
        </div>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button type="button" size="lg" disabled={pending} onClick={retry} className="min-h-11 rounded-xl">
            <RotateCcw aria-hidden="true" />
            {pending ? "Tentando novamente..." : "Tentar novamente"}
          </Button>
          <Button asChild variant="outline" size="lg" className="min-h-11 rounded-xl">
            <Link href="/EventsCreated">Ir para a agenda</Link>
          </Button>
        </div>
        {digest && <p className="mt-6 text-xs text-muted-foreground">Código para suporte: <span className="font-mono">{digest}</span></p>}
        <p role="status" className="sr-only">{pending ? "Carregando a página novamente." : ""}</p>
      </section>
    </div>
  );
}
