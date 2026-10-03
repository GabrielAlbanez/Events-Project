"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, LoaderCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type VerificationState = "loading" | "verified" | "invalid" | "unavailable";

async function verifyEmail(token: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api/verifyEmail?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (response.status >= 500 || response.status === 429) throw new Error("Verification unavailable");
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("status" in data)) throw new Error("Invalid verification response");
    return response.ok && data.status === "success";
  } finally {
    clearTimeout(timeout);
  }
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [state, setState] = useState<VerificationState>("loading");
  const [attempt, setAttempt] = useState(0);
  const request = useRef<{ token: string; attempt: number; promise: Promise<boolean> } | null>(null);

  useEffect(() => {
    let active = true;
    let redirect: ReturnType<typeof setTimeout> | undefined;
    if (!token) {
      setState("invalid");
      return;
    }
    setState("loading");
    // Reuse the request during StrictMode's effect replay: verification consumes the token.
    if (request.current?.token !== token || request.current.attempt !== attempt) {
      request.current = { token, attempt, promise: verifyEmail(token) };
    }
    void request.current.promise.then((verified) => {
      if (!active) return;
      setState(verified ? "verified" : "invalid");
      if (verified) redirect = setTimeout(() => router.replace("/login"), 3000);
    }).catch(() => {
      if (active) setState("unavailable");
    });
    return () => {
      active = false;
      if (redirect) clearTimeout(redirect);
    };
  }, [token, attempt, router]);

  const success = state === "verified";
  const loading = state === "loading";
  const title = loading ? "Verificando seu e-mail" : success ? "E-mail confirmado!" : state === "invalid" ? "Não foi possível confirmar este link" : "A confirmação está indisponível";
  const description = loading
    ? "Aguarde um instante enquanto confirmamos sua conta."
    : success
      ? "Sua conta está pronta. Você será direcionado para entrar em alguns segundos."
      : state === "invalid"
        ? "O link pode estar incompleto, expirado ou já ter sido usado. Se você já confirmou sua conta, tente entrar."
        : "Confira sua conexão e tente novamente. Se a conta já foi confirmada, você pode entrar normalmente.";

  return (
    <main className="flex min-h-[80vh] w-full items-center justify-center px-4 py-10 sm:px-6">
      <section className="w-full max-w-lg rounded-3xl border bg-card p-6 text-center shadow-sm sm:p-10" aria-busy={loading}>
        <div role={loading || success ? "status" : "alert"} aria-live="polite">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {loading ? <LoaderCircle className="h-7 w-7 motion-safe:animate-spin" aria-hidden="true" /> : success ? <CheckCircle className="h-7 w-7" aria-hidden="true" /> : <XCircle className="h-7 w-7" aria-hidden="true" />}
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-3 leading-7 text-muted-foreground">{description}</p>
        </div>
        {!loading && <div className="mt-7 flex flex-col gap-3">
          {state === "unavailable" && <Button size="lg" className="min-h-11 rounded-xl" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</Button>}
          <Button asChild size="lg" variant={state === "unavailable" ? "outline" : "default"} className="min-h-11 rounded-xl"><Link href="/login">Ir para o login</Link></Button>
          {!success && <Link href="/confirmar-email" className="rounded-lg py-2 text-sm font-semibold text-primary underline underline-offset-4">Reenviar confirmação de e-mail</Link>}
          {!success && <Link href="/" className="rounded-lg py-2 text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Voltar ao início</Link>}
        </div>}
      </section>
    </main>
  );
}
