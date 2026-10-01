"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ResultsError({ reset }: ErrorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <main className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <SidebarTrigger aria-label="Abrir menu de navegação" />
        <section aria-labelledby="page-error-title" aria-busy={pending} className="rounded-3xl border bg-card p-6 shadow-sm sm:p-10">
          <div role="alert">
            <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-primary">Vamos tentar novamente</p>
            <h1 id="page-error-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Não foi possível abrir os resultados</h1>
            <p className="mt-3 max-w-xl leading-7 text-muted-foreground">O painel encontrou uma falha ao carregar. Tente novamente ou acompanhe seus eventos enquanto isso.</p>
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button type="button" size="lg" disabled={pending} onClick={retry} className="min-h-11 rounded-xl">
              <RotateCcw aria-hidden="true" />
              {pending ? "Tentando novamente..." : "Tentar novamente"}
            </Button>
            <Button asChild variant="outline" size="lg" className="min-h-11 rounded-xl">
              <Link href="/myEvents">Ver meus eventos</Link>
            </Button>
          </div>
          <p role="status" className="sr-only">{pending ? "Carregando a página novamente." : ""}</p>
        </section>
      </div>
    </main>
  );
}
