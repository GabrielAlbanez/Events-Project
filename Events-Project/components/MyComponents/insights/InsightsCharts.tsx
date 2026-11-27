import { formatRate, type FunnelStage } from "@/lib/organizerInsights";

const number = (value: number) => value.toLocaleString("pt-BR");

/** "2026-11-18" -> "18/11" sem conversão de fuso (o dia já é uma chave UTC). */
export function shortDay(day: string): string {
  const [, month, date] = day.split("-");
  return date && month ? `${date}/${month}` : day;
}

/** Funil em barras horizontais. Cada etapa traz valor e taxa sobre a etapa anterior, em texto. */
export function FunnelChart({ stages, compact = false }: { stages: FunnelStage[]; compact?: boolean }) {
  const max = Math.max(1, ...stages.map(stage => stage.value));
  return (
    <ol className={compact ? "space-y-2" : "space-y-3"}>
      {stages.map((stage, index) => {
        const width = stage.value > 0 ? Math.max(2, (stage.value / max) * 100) : 0;
        const previous = index > 0 ? stages[index - 1] : null;
        const comparable = stage.rate !== null;
        return (
          <li key={stage.key} className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className={compact ? "text-xs font-medium" : "text-sm font-medium"}>
                {stage.label}
                {stage.consentBased && <><span className="text-muted-foreground" aria-hidden="true" title="Conta só quem aceitou métricas">*</span><span className="sr-only"> (conta só quem aceitou métricas)</span></>}
              </span>
              <span className={compact ? "text-xs tabular-nums" : "text-sm tabular-nums"}>
                <strong className="font-semibold">{number(stage.value)}</strong>
                {previous && (
                  <span className="ml-2 text-muted-foreground">
                    {comparable ? `${formatRate(stage.rate)} de ${previous.label.toLowerCase()}` : previous.value > 0 ? "taxa não comparável" : ""}
                  </span>
                )}
              </span>
            </div>
            <div className={`mt-1 overflow-hidden rounded-full bg-muted ${compact ? "h-1.5" : "h-2.5"}`} aria-hidden="true">
              <div className={`h-full rounded-full ${stage.consentBased ? "bg-primary/60" : "bg-primary"}`} style={{ width: `${width}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export type DailyPoint = { day: string; views: number; ticketClicks: number };

/** Série diária de visualizações (uma série, cor única). Valores exatos ficam na tabela abaixo e no foco/hover de cada barra. */
export function DailyViewsChart({ points, caption }: { points: DailyPoint[]; caption: string }) {
  const max = Math.max(1, ...points.map(point => point.views));
  const total = points.reduce((sum, point) => sum + point.views, 0);
  const tickEvery = points.length > 31 ? 15 : points.length > 10 ? 7 : 1;
  return (
    <figure className="min-w-0">
      <figcaption className="sr-only">{caption}</figcaption>
      {total === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma visualização medida neste período.</p>
      ) : (
        <>
          <div className="relative">
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" aria-hidden="true" />
            <span className="absolute right-0 top-0 -translate-y-full pb-1 text-xs tabular-nums text-muted-foreground" aria-hidden="true">{number(max)}</span>
            <ul className="flex h-36 items-end gap-[2px] pt-2" aria-label={caption}>
              {points.map((point, index) => {
                const align = index < points.length / 3 ? "left-0" : index > (points.length * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2";
                const label = `${shortDay(point.day)}: ${number(point.views)} visualizações e ${number(point.ticketClicks)} cliques no ingresso`;
                return (
                  <li key={point.day} className="group relative flex h-full min-w-0 flex-1 items-end">
                    {/* Sem tabIndex por barra: 90 paradas de Tab atrapalham o teclado. Leitores de tela leem o texto abaixo e a tabela tem os mesmos dados. */}
                    <span className="sr-only">{label}</span>
                    <span aria-hidden="true" className="flex h-full w-full items-end rounded-t">
                      <span className="block w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80 motion-reduce:transition-none" style={{ height: point.views > 0 ? `${Math.max(3, (point.views / max) * 100)}%` : "0%" }} />
                    </span>
                    <span aria-hidden="true" className={`pointer-events-none absolute bottom-full ${align} z-10 mb-2 hidden whitespace-nowrap rounded-lg border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-surface group-hover:block`}>
                      <span className="block font-semibold">{shortDay(point.day)}</span>
                      <span className="block tabular-nums">{number(point.views)} visualizações</span>
                      <span className="block tabular-nums">{number(point.ticketClicks)} cliques</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="mt-1 flex gap-[2px] border-t pt-1 text-[11px] text-muted-foreground" aria-hidden="true">
            {points.map((point, index) => <span key={point.day} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">{index % tickEvery === 0 ? shortDay(point.day) : ""}</span>)}
          </div>
        </>
      )}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-brand">Ver dados em tabela</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 bg-muted text-xs text-muted-foreground"><tr><th scope="col" className="px-3 py-2 font-medium">Dia</th><th scope="col" className="px-3 py-2 text-right font-medium">Visualizações</th><th scope="col" className="px-3 py-2 text-right font-medium">Cliques no ingresso</th></tr></thead>
            <tbody>{[...points].reverse().map(point => <tr key={point.day} className="border-t"><th scope="row" className="px-3 py-1.5 font-normal">{shortDay(point.day)}</th><td className="px-3 py-1.5 text-right tabular-nums">{number(point.views)}</td><td className="px-3 py-1.5 text-right tabular-nums">{number(point.ticketClicks)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
