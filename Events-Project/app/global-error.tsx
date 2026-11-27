"use client";

import "./globals.css";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** Last-resort boundary: replaces the root layout, so it renders its own document without providers. */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const digest = typeof error.digest === "string" && /^[\w-]{1,64}$/.test(error.digest) ? error.digest : null;

  return (
    <html lang="pt-BR">
      <head>
        <title>Erro inesperado | EventMap</title>
        <meta name="robots" content="noindex" />
      </head>
      <body className="bg-background text-foreground antialiased">
        <main id="conteudo" className="flex min-h-screen w-full items-center justify-center px-4 py-10">
          <section aria-labelledby="global-error-title" className="w-full max-w-lg rounded-[26px] border bg-card p-6 text-center sm:p-10 shadow-[var(--em-shadow-card)]">
            <div role="alert">
              <p className="text-sm font-semibold text-brand">EventMap</p>
              <h1 id="global-error-title" className="mt-2 text-2xl font-bold tracking-tight">O site encontrou um erro inesperado</h1>
              <p className="mt-3 leading-7 text-muted-foreground">Nada foi perdido. Tente carregar novamente em alguns instantes.</p>
            </div>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <button type="button" onClick={reset} className="inline-flex min-h-11 items-center justify-center rounded-full bg-cta px-6 text-sm font-semibold text-cta-foreground hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                Tentar novamente
              </button>
              {/* A full navigation recovers even when the client router is unusable. */}
              <a href="/" className="inline-flex min-h-11 items-center justify-center rounded-full border px-6 text-sm font-semibold hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                Voltar ao início
              </a>
            </div>
            {digest && <p className="mt-6 text-xs text-muted-foreground">Código para suporte: <span className="font-mono">{digest}</span></p>}
          </section>
        </main>
      </body>
    </html>
  );
}
