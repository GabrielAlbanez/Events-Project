import { notFound } from "next/navigation";
import Link from "next/link";
import { getPromoterProfile } from "@/app/(actions)/engagement/action";
import { FollowPromoter } from "@/components/MyComponents/EventPublicActions";
import { EventCards } from "@/components/MyComponents/TableEventsClient";
import { FadeInView } from "@/components/animations/FadeInView";
import { ParallaxCard } from "@/components/animations/ParallaxCard";
import { ProfileAvatar } from "@/components/MyComponents/ProfileAvatar";
export const dynamic = "force-dynamic";
export default async function Promoter({ params }: { params: { id: string } }) {
 const profile = await getPromoterProfile(params.id);
 if (!profile) notFound();
 return <main className="w-full px-4 py-8 sm:px-6 lg:px-10"><div className="mx-auto max-w-6xl space-y-8"><Link href="/EventsCreated" className="text-sm font-semibold text-primary">← Agenda</Link><FadeInView><header className="relative isolate flex flex-col gap-5 overflow-hidden rounded-3xl border bg-card p-6 sm:flex-row sm:p-8"><ParallaxCard className="pointer-events-none absolute inset-0" decorationClassName="absolute -right-10 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" secondaryClassName="absolute bottom-0 right-40 h-40 w-40 rounded-full bg-violet-400/10 blur-3xl" secondaryDecoration={<span className="block h-full w-full" />} pointerHost="parent" mobileScroll><span className="block h-full w-full" /></ParallaxCard><ProfileAvatar src={profile.image} name={profile.name || "Organizador"} size={96} className="relative z-10 h-24 w-24 shrink-0 rounded-2xl object-cover" /><div className="relative z-10 min-w-0 flex-1"><p className="text-sm font-semibold text-primary">Organizador</p><h1 className="mt-1 break-words text-3xl font-bold">{profile.name || 'Organizador'}</h1>{profile.bio && <p className="mt-3 max-w-2xl whitespace-pre-wrap text-muted-foreground">{profile.bio}</p>}{profile.contactUrl && /^https?:\/\//i.test(profile.contactUrl) && <a className="mt-3 inline-block text-primary underline" href={profile.contactUrl} target="_blank" rel="noopener noreferrer">Contato público ↗</a>}<div className="mt-5"><FollowPromoter promoterId={profile.id} following={profile.isFollowing} count={profile.followerCount} /></div></div></header></FadeInView><section className="space-y-5"><h2 className="text-2xl font-semibold">Eventos publicados</h2>{profile.events.length ? <EventCards events={profile.events} /> : <p className="rounded-2xl border border-dashed p-8 text-muted-foreground">Este organizador ainda não possui eventos publicados.</p>}</section></div></main>;
}
