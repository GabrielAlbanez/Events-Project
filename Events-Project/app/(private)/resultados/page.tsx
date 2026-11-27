import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, CalendarCheck, Info, Star, Trophy, UserPlus, Users } from "lucide-react";
import { getPromoterInsights } from "@/app/(actions)/engagement/action";
import { eventStatusLabels, type EventStatus } from "@/types/features";
import { publicSiteUrl } from "@/lib/publicUrl";
import { INSIGHTS_PERIODS, buildEmbedSnippet, formatRate, insightsPeriodLabels, parseInsightsPeriod, promoterCalendarUrl, type InsightsPeriod } from "@/lib/organizerInsights";
import { DailyViewsChart, FunnelChart } from "@/components/MyComponents/insights/InsightsCharts";
import { EmbedShareBox } from "@/components/MyComponents/insights/EmbedShareBox";
import type { EventInsight, PromoterInsights } from "@/lib/services/promoters";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Resultados", robots: { index: false, follow: false } };

type ResultsSearchParams = { periodo?: string | string[]; promotor?: string | string[] };

const number = (value: number) => value.toLocaleString("pt-BR");
const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const promoterIdPattern = /^[A-Za-z0-9_-]{1,64}$/;

function periodHref(period: InsightsPeriod, promoterId: string | undefined) {
  const params = new URLSearchParams({ periodo: period });
  if (promoterId) params.set("promotor", promoterId);
  return `/resultados?${params.toString()}`;
}

function siteOrigin(): string | null {
  try { return publicSiteUrl().origin; } catch { return null; }
}

export default async function Resultados({ searchParams }: { searchParams: ResultsSearchParams }) {
  const period = parseInsightsPeriod(single(searchParams.periodo));
  const requestedPromoter = single(searchParams.promotor)?.trim();
  const promoterId = requestedPromoter && promoterIdPattern.test(requestedPromoter) ? requestedPromoter : undefined;
  const result = await getPromoterInsights({ period, ...(promoterId ? { promoterId } : {}) });

  return (
    <div className="em-page w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10" data-decor="ring">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="em-eyebrow">Painel de eventos</p>
            <h1 className="em-title mt-3">Resultados</h1>
            <p className="em-subtitle mt-3">
              {result.ok && result.data.viewer.viewingOther
                ? <>Resultados de <strong className="text-foreground">{result.data.promoter.name || "organizador"}</strong> (visão de administração).</>
                : "Do primeiro olhar à entrada no evento: veja como as pessoas chegaram até você."}
            </p>
          </div>
          <nav aria-label="Período" className="flex w-full flex-wrap gap-1 rounded-[22px] border bg-card p-1 sm:w-auto shadow-[var(--em-shadow-card)]">
            {INSIGHTS_PERIODS.map(option => (
              <Link key={option} href={periodHref(option, promoterId)} aria-current={option === period ? "page" : undefined} scroll={false}
                className={`flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:flex-none ${option === period ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                {insightsPeriodLabels[option]}
              </Link>
            ))}
          </nav>
        </header>

        {!result.ok ? (
          <section role="alert" className="rounded-[22px] border bg-card p-6 sm:p-8 shadow-[var(--em-shadow-card)]">
            <h2 className="text-lg font-semibold">{result.reason === "UNAVAILABLE" ? "Resultados indisponíveis no momento" : "Não foi possível abrir estes resultados"}</h2>
            <p className="mt-2 text-muted-foreground">{result.message}</p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
              {result.reason === "UNAVAILABLE" && <Link href={periodHref(period, promoterId)} className="text-brand underline underline-offset-4">Tentar novamente</Link>}
              {promoterId && <Link href="/resultados" className="text-brand underline underline-offset-4">Ver meus resultados</Link>}
              <Link href="/myEvents" className="text-brand underline underline-offset-4">Ir para meus eventos</Link>
            </div>
          </section>
        ) : (
          <ResultsBody data={result.data} period={period} />
        )}
      </div>
    </div>
  );
}

function ResultsBody({ data, period }: { data: PromoterInsights; period: InsightsPeriod }) {
  const origin = siteOrigin();
  const periodText = period === "all" ? "desde o início" : `nos últimos ${insightsPeriodLabels[period]}`;
  const { totals } = data;
  const hasEvents = data.events.length > 0;

  return (
    <>
      <aside aria-labelledby="metrics-disclosure-title" className="flex gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <div>
          <h2 id="metrics-disclosure-title" className="font-semibold">Como ler estes números</h2>
          <p className="text-muted-foreground">
            <strong className="font-medium text-foreground">Visualizações e cliques no ingresso (*)</strong> contam apenas visitantes que aceitaram o cookie de métricas — o número real de interessados é maior, e não fazemos estimativas.{" "}
            <strong className="font-medium text-foreground">Favoritos, inscrições, lista de espera, check-ins e seguidores</strong> são completos. Cliques no ingresso não são vendas confirmadas.
          </p>
        </div>
      </aside>

      <section aria-label="Resumo" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Users} label="Seguidores" value={number(data.followers.total)} detail={data.followers.gained === null ? "total acumulado" : `+${number(data.followers.gained)} ${periodText}`} />
        <Kpi icon={UserPlus} label="Inscrições" value={number(totals.registrations)} detail={`${number(totals.breakdown.waitlisted)} na lista de espera · ${periodText}`} />
        <Kpi icon={CalendarCheck} label="Check-ins" value={number(totals.checkIns)} detail={data.attendanceRate === null ? "sem inscrições no período" : `${formatRate(data.attendanceRate)} de comparecimento`} />
        <Kpi icon={Star} label="Avaliação média" value={data.rating.average === null ? "—" : data.rating.average.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} detail={data.rating.count ? `${number(data.rating.count)} ${data.rating.count === 1 ? "avaliação" : "avaliações"} na comunidade (todo o período)` : "ainda sem avaliações pós-evento"} />
      </section>

      {!hasEvents ? (
        <section className="rounded-[22px] border border-dashed bg-card p-8 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-brand" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">{data.viewer.viewingOther ? "Este organizador ainda não tem eventos" : "Seus resultados aparecem aqui"}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{data.viewer.viewingOther ? "Quando houver eventos cadastrados nesta conta, os resultados aparecem aqui." : "Assim que você publicar um evento, mostramos visualizações, inscrições, check-ins e avaliações em um só lugar."}</p>
          {!data.viewer.viewingOther && <Link href="/CriarEvento" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-cta px-4 text-sm font-semibold text-cta-foreground hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Criar evento</Link>}
        </section>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <section aria-labelledby="funnel-title" className="rounded-[22px] border bg-card p-5 sm:p-6 shadow-[var(--em-shadow-card)]">
              <h2 id="funnel-title" className="text-xl font-semibold">Funil de todos os eventos</h2>
              <p className="mt-1 text-sm text-muted-foreground">Atividade registrada {periodText}.</p>
              <div className="mt-5"><FunnelChart stages={data.funnel} /></div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">“Taxa não comparável” aparece quando uma etapa supera a anterior: as etapas com * contam só parte do público.</p>
            </section>
            <section aria-labelledby="daily-title" className="rounded-[22px] border bg-card p-5 sm:p-6 shadow-[var(--em-shadow-card)]">
              <h2 id="daily-title" className="text-xl font-semibold">Visualizações por dia*</h2>
              <p className="mt-1 text-sm text-muted-foreground">{period === "all" ? "Últimos 30 dias." : `Últimos ${insightsPeriodLabels[period]}.`} Passe o cursor sobre as barras ou abra a tabela para ver cada dia.</p>
              <div className="mt-8"><DailyViewsChart points={data.daily} caption={`Visualizações por dia ${period === "all" ? "nos últimos 30 dias" : periodText}`} /></div>
            </section>
          </div>

          {data.top.length > 0 && (
            <section aria-labelledby="top-title" className="rounded-[22px] border bg-card p-5 sm:p-6 shadow-[var(--em-shadow-card)]">
              <div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-brand" aria-hidden="true" /><h2 id="top-title" className="text-xl font-semibold">Eventos em destaque</h2></div>
              <p className="mt-1 text-sm text-muted-foreground">Ordenados por inscrições, check-ins e favoritos {periodText}.</p>
              <ol className="mt-4 divide-y">
                {data.top.map((event, index) => (
                  <li key={event.id} className="flex items-center gap-3 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums" aria-hidden="true">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/eventos/${encodeURIComponent(event.id)}`} className="block truncate font-medium hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{event.nome}</Link>
                      <p className="text-xs text-muted-foreground">{number(event.registrations)} inscrições · {number(event.checkIns)} check-ins · {number(event.favorites)} favoritos</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-labelledby="events-title" className="rounded-[22px] border bg-card p-5 sm:p-6 shadow-[var(--em-shadow-card)]">
            <h2 id="events-title" className="text-xl font-semibold">Por evento</h2>
            <p className="mt-1 text-sm text-muted-foreground">Inscrições e favoritos feitos {periodText}, com o status atual de cada inscrição.</p>
            <ul className="mt-5 grid gap-4 md:grid-cols-2">
              {data.events.map(event => <EventCard key={event.id} event={event} />)}
            </ul>
          </section>
        </>
      )}

      {origin ? (
        <EmbedShareBox
          snippet={buildEmbedSnippet(origin, data.promoter.id)}
          calendarUrl={promoterCalendarUrl(origin, data.promoter.id)}
          previewUrl={`${origin}/embed/promotores/${encodeURIComponent(data.promoter.id)}`}
          note={data.viewer.viewingOther ? "Código da conta que você está visualizando." : undefined}
        />
      ) : (
        <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">O código de incorporação fica disponível quando o endereço público do site estiver configurado.</p>
      )}
    </>
  );
}

function Kpi({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[22px] border bg-card p-5 shadow-[var(--em-shadow-card)]">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-brand"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function EventCard({ event }: { event: EventInsight }) {
  const status = eventStatusLabels[event.status as EventStatus] ?? event.status;
  const facts: Array<{ label: string; value: string }> = [
    { label: "Lista de espera", value: number(event.breakdown.waitlisted) },
    { label: "Comparecimento", value: formatRate(event.attendanceRate) },
    { label: "Ocupação", value: event.capacity ? `${formatRate(event.occupancyRate)} de ${number(event.capacity)}` : "sem limite" },
    { label: "Avaliação", value: event.rating.average === null ? "—" : `${event.rating.average.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} (${number(event.rating.count)})` },
  ];
  return (
    <li className="min-w-0 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-semibold"><Link href={`/eventos/${encodeURIComponent(event.id)}`} className="hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{event.nome}</Link></h3>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{status}</span>
      </div>
      <div className="mt-4"><FunnelChart stages={event.funnel} compact /></div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        {facts.map(fact => (
          <div key={fact.label} className="rounded-lg bg-muted/50 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{fact.label}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{fact.value}</dd>
          </div>
        ))}
      </dl>
      {event.status === "PUBLISHED" || event.status === "ENDED" ? (
        <Link href={`/myEvents/${encodeURIComponent(event.id)}/checkin`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline">Abrir check-in →</Link>
      ) : null}
    </li>
  );
}
