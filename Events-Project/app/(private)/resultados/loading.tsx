export default function ResultsLoading() {
  return (
    <div className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10" aria-busy="true">
      <div className="mx-auto max-w-6xl space-y-7">
        <p role="status" className="sr-only">Carregando resultados...</p>
        <div className="space-y-3" aria-hidden="true">
          <div className="h-4 w-32 rounded-full bg-muted motion-safe:animate-pulse" />
          <div className="h-9 w-56 rounded-xl bg-muted motion-safe:animate-pulse" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
          {[0, 1, 2, 3].map(item => <div key={item} className="h-36 rounded-[22px] border bg-card motion-safe:animate-pulse shadow-[var(--em-shadow-card)]" />)}
        </div>
        <div className="grid gap-5 lg:grid-cols-2" aria-hidden="true">
          <div className="h-72 rounded-[22px] border bg-card motion-safe:animate-pulse shadow-[var(--em-shadow-card)]" />
          <div className="h-72 rounded-[22px] border bg-card motion-safe:animate-pulse shadow-[var(--em-shadow-card)]" />
        </div>
      </div>
    </div>
  );
}
