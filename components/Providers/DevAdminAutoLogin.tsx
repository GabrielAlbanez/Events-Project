"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const storageKey = "eventmap:dev-admin-auto-login-run";

export default function DevAdminAutoLogin({ children, runId }: { children: ReactNode; runId: string }) {
  const { data: session, status } = useSession();
  const attempted = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (status === "loading" || attempted.current) return;

    try {
      if (window.localStorage.getItem(storageKey) === runId) {
        setReady(true);
        return;
      }
      // Store this before signIn, so logout cannot trigger another automatic login.
      window.localStorage.setItem(storageKey, runId);
      attempted.current = true;
    } catch {
      setError(true);
      return;
    }

    if (session?.user?.devAutoLoginAdmin) {
      setReady(true);
      return;
    }

    void signIn("dev-admin", { redirect: false })
      .then((result) => {
        if (!result?.ok) {
          setError(true);
          return;
        }
        window.location.reload();
      })
      .catch(() => setError(true));
  }, [runId, session?.user?.devAutoLoginAdmin, status]);

  if (ready) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-foreground">
      {error ? (
        <div>
          <p>Não foi possível iniciar a sessão de administrador de desenvolvimento.</p>
          <p className="mt-2 text-sm text-muted-foreground">Verifique a conexão com o banco de dados. Você ainda pode entrar com outra conta.</p>
          <button type="button" onClick={() => setReady(true)} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            Continuar para o site
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" role="status">Iniciando sessão de desenvolvimento…</p>
      )}
    </div>
  );
}
