"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { ShieldCheck, LockKeyhole, ArrowLeft, LoaderCircle } from "lucide-react";

type ImpersonationStatus = {
  blocked: boolean;
  impersonation: { userName: string; expiresAt: string } | null;
  restoreRequired?: boolean;
};

const blockedMessage = "Um administrador está acessando sua conta no momento. Tente novamente em instantes.";

export default function ImpersonationGuard({ children }: { children: ReactNode }) {
  const { data: session, status: authenticationStatus } = useSession();
  const [state, setState] = useState<ImpersonationStatus | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  const previouslyBlocked = useRef(false);
  const blocked = state?.blocked || session?.error === "AccountImpersonated";
  const impersonation = state?.impersonation ?? session?.impersonation;

  useEffect(() => {
    setState(null);
    setError("");
    previouslyBlocked.current = false;
    if (authenticationStatus !== "authenticated") return;
    let active = true;
    let request: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      request = new AbortController();
      try {
        const response = await fetch("/api/admin/impersonation/status", { cache: "no-store", signal: request.signal });
        if (!response.ok) throw new Error();
        const next: ImpersonationStatus = await response.json();
        if (!active) return;
        if (next.restoreRequired || (previouslyBlocked.current && !next.blocked)) {
          window.location.reload();
          return;
        }
        previouslyBlocked.current = next.blocked;
        setState(next);
        setError("");
      } catch {
        if (active) setError("Não foi possível atualizar o acesso. Tentaremos novamente automaticamente.");
      } finally {
        if (active) timer = setTimeout(() => void check(), 5000);
      }
    };
    void check();
    return () => { active = false; request?.abort(); if (timer) clearTimeout(timer); };
  }, [session?.user?.id, session?.error, authenticationStatus]);

  const endPreview = async () => {
    if (leaving) return;
    setLeaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/impersonation/end", { method: "POST" });
      const result: { ok?: boolean; error?: string } = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Não foi possível sair da visualização. Tente novamente.");
      window.location.assign("/admin");
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "Não foi possível sair da visualização.");
      setLeaving(false);
    }
  };

  return (
    <>
      {impersonation && !blocked && (
        <>
          {/* The sidebar is portalled; reserve the banner space there as well. */}
          <style>{`
            [data-sidebar="sidebar"][data-mobile="true"] { top: 6rem; height: calc(100dvh - 6rem); }
            @media (min-width: 640px) {
              [data-sidebar="sidebar"][data-mobile="true"] { top: 4rem; height: calc(100dvh - 4rem); }
            }
          `}</style>
          <div className="h-24 shrink-0 sm:h-16" aria-hidden="true" />
          <aside aria-label="Visualização administrativa" className="fixed inset-x-0 top-0 z-[160] flex min-h-24 flex-col justify-center gap-2 border-b border-primary/25 bg-background px-4 py-2 text-foreground shadow-sm sm:min-h-16 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="flex min-w-0 items-center gap-2 text-sm"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><span className="truncate">Você está logado como <strong>{impersonation.userName}</strong></span></p>
            <button type="button" disabled={leaving} onClick={() => void endPreview()} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
              {leaving ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowLeft className="h-4 w-4" aria-hidden="true" />}
              {leaving ? "Restaurando conta..." : "Sair da visualização"}
            </button>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </aside>
        </>
      )}
      {!blocked && children}
      {blocked && (
        <main className="flex min-h-screen w-full items-center justify-center bg-background p-6 text-foreground">
          <section role="alert" className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><LockKeyhole className="h-8 w-8" aria-hidden="true" /></div>
            <h1 className="text-xl font-semibold">Acesso temporariamente pausado</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{blockedMessage}</p>
            <p role="status" className="mt-6 text-xs text-muted-foreground">Seu acesso será liberado automaticamente quando a visualização terminar.</p>
            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
          </section>
        </main>
      )}
    </>
  );
}
