import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, CalendarPlus, History, Star } from "lucide-react";
import { getPromoterProfile } from "@/app/(actions)/engagement/action";
import { getPromoterPublicAgenda } from "@/lib/services/promoters";
import { FollowPromoter } from "@/components/MyComponents/EventPublicActions";
import { EventCards } from "@/components/MyComponents/TableEventsClient";
import { FadeInView } from "@/components/animations/FadeInView";
import { ParallaxCard } from "@/components/animations/ParallaxCard";
import { ProfileAvatar } from "@/components/MyComponents/ProfileAvatar";
import { EmbedShareBox } from "@/components/MyComponents/insights/EmbedShareBox";
import { publicSiteUrl } from "@/lib/publicUrl";
import { normalizeEventImageUrl } from "@/lib/eventImageUrl";
import { buildEmbedSnippet, promoterCalendarUrl } from "@/lib/organizerInsights";
export const dynamic = "force-dynamic";
type Props = { params: { id: string } };
const PAST_LIMIT = 12;
function siteBase(): URL | null {
 try { return publicSiteUrl(); } catch { return null; }
}
function absoluteUrl(value: string | null | undefined, base: URL): string | undefined {
 const normalized = normalizeEventImageUrl(value);
 if (!normalized) return undefined;
 try { const url = new URL(normalized, base); return ["http:", "https:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
 const agenda = await getPromoterPublicAgenda(params.id, { limit: 6 }).catch(() => null);
 if (!agenda) return { title: "Organizador indisponível", robots: { index: false, follow: false } };
 const base = siteBase();
 const name = agenda.promoter.name || "Organizador";
 const count = agenda.upcoming.length;
 const fallback = count ? `${name} no EventMap: ${count === 1 ? "1 próximo evento" : `${count}${count >= 6 ? "+" : ""} próximos eventos`}. Siga para saber das novidades.` : `${name} no EventMap. Siga para saber quando houver novos eventos.`;
 const description = (agenda.promoter.bio?.trim() || fallback).replace(/\s+/g, " ").slice(0, 160);
 const title = `${name} · Agenda de eventos`;
 if (!base) return { title, description };
 const canonical = new URL("/promotores/" + encodeURIComponent(agenda.promoter.id), base).href;
 const image = agenda.upcoming.map(event => absoluteUrl(event.banner, base)).find(Boolean) ?? absoluteUrl(agenda.promoter.image, base);
 return {
  metadataBase: base,
  title,
  description,
  alternates: { canonical, types: { "text/calendar": promoterCalendarUrl(base.origin, agenda.promoter.id) } },
  openGraph: { type: "profile", url: canonical, title, description, ...(image ? { images: [{ url: image }] } : {}) },
  twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? { images: [image] } : {}) },
 };
}
export default async function Promoter({ params }: Props) {
 const profile = await getPromoterProfile(params.id);
 if (!profile) notFound();
 const base = siteBase();
 const name = profile.name || "Organizador";
 const past = profile.past.slice(0, PAST_LIMIT);
 const calendarUrl = base ? promoterCalendarUrl(base.origin, profile.id) : null;
 return <div className="w-full px-4 py-8 sm:px-6 lg:px-10"><div className="mx-auto max-w-6xl space-y-10">
  <Link href="/EventsCreated" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">← Agenda</Link>
  <FadeInView><header className="relative isolate flex flex-col gap-5 overflow-hidden rounded-3xl border bg-card p-6 sm:flex-row sm:p-8"><ParallaxCard className="pointer-events-none absolute inset-0" decorationClassName="absolute -right-10 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" secondaryClassName="absolute bottom-0 right-40 h-40 w-40 rounded-full bg-primary/5 blur-3xl" secondaryDecoration={<span className="block h-full w-full" />} pointerHost="parent" mobileScroll><span className="block h-full w-full" /></ParallaxCard><ProfileAvatar preview src={profile.image} name={name} size={96} className="relative z-10 h-24 w-24 shrink-0 rounded-2xl object-cover" /><div className="relative z-10 min-w-0 flex-1"><p className="text-sm font-semibold text-brand">Organizador</p><h1 className="mt-1 break-words text-3xl font-bold">{name}</h1>{profile.bio && <p className="mt-3 max-w-2xl whitespace-pre-wrap break-words text-muted-foreground">{profile.bio}</p>}
   <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground" aria-label="Resumo do organizador">
    <li className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-brand" aria-hidden="true" /><strong className="font-semibold tabular-nums text-foreground">{profile.upcoming.length}</strong> {profile.upcoming.length === 1 ? "próximo evento" : "próximos eventos"}</li>
    <li className="inline-flex items-center gap-1.5"><History className="h-4 w-4 text-brand" aria-hidden="true" /><strong className="font-semibold tabular-nums text-foreground">{profile.past.length}</strong> {profile.past.length === 1 ? "evento realizado" : "eventos realizados"}</li>
    {profile.rating && <li className="inline-flex items-center gap-1.5"><Star className="h-4 w-4 text-brand" aria-hidden="true" /><strong className="font-semibold tabular-nums text-foreground">{profile.rating.average.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong> de 5 · {profile.rating.count} avaliações de participantes</li>}
   </ul>
   {profile.contactUrl && /^https?:\/\//i.test(profile.contactUrl) && <a className="mt-3 inline-flex min-h-11 items-center text-brand underline" href={profile.contactUrl} target="_blank" rel="noopener noreferrer">Contato público ↗</a>}
   <div className="mt-5 flex flex-wrap items-center gap-3"><FollowPromoter promoterId={profile.id} following={profile.isFollowing} count={profile.followerCount} />{calendarUrl && profile.upcoming.length > 0 && <a href={calendarUrl} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><CalendarPlus className="h-4 w-4" aria-hidden="true" />Assinar agenda (ICS)</a>}</div>
  </div></header></FadeInView>
  <section aria-labelledby="upcoming-title" className="space-y-5"><h2 id="upcoming-title" className="text-2xl font-semibold">Próximos eventos</h2>{profile.upcoming.length ? <EventCards events={profile.upcoming} /> : <p className="rounded-2xl border border-dashed p-8 text-muted-foreground">Nenhum evento futuro publicado agora. Siga {name} para saber quando houver novidades.</p>}</section>
  {past.length > 0 && <section aria-labelledby="past-title" className="space-y-5"><div><h2 id="past-title" className="text-2xl font-semibold">Eventos realizados</h2>{profile.past.length > past.length && <p className="mt-1 text-sm text-muted-foreground">Mostrando os {past.length} mais recentes de {profile.past.length}.</p>}</div><EventCards events={past} /></section>}
  {base && profile.isOwner && <EmbedShareBox snippet={buildEmbedSnippet(base.origin, profile.id)} calendarUrl={promoterCalendarUrl(base.origin, profile.id)} previewUrl={`${base.origin}/embed/promotores/${encodeURIComponent(profile.id)}`} note="Só você vê esta caixa. Os números completos ficam em Resultados." />}
 </div></div>;
}
