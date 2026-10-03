import { notFound } from "next/navigation";
import Link from "next/link";
import { getPromoterProfile } from "@/app/(actions)/engagement/action";
import { FollowPromoter } from "@/components/MyComponents/EventPublicActions";
import { EventCards } from "@/components/MyComponents/TableEventsClient";
export const dynamic = "force-dynamic";
export default async function Promoter({ params }: { params: { id: string } }) {
 const profile = await getPromoterProfile(params.id);
 if (!profile) notFound();
 return <main className="w-full px-4 py-8 sm:px-6 lg:px-10"><div className="mx-auto max-w-6xl space-y-8"><Link href="/EventsCreated" className="text-sm font-semibold text-primary">← Agenda</Link><header className="flex flex-col gap-5 rounded-3xl border bg-card p-6 sm:flex-row sm:p-8">{profile.image && <img src={profile.image} alt="" className="h-24 w-24 rounded-2xl object-cover" />}<div className="min-w-0 flex-1"><p className="text-sm font-semibold text-primary">Organizador</p><h1 className="mt-1 break-words text-3xl font-bold">{profile.name || 'Organizador'}</h1>{profile.bio && <p className="mt-3 max-w-2xl whitespace-pre-wrap text-muted-foreground">{profile.bio}</p>}{profile.contactUrl && /^https?:\/\//i.test(profile.contactUrl) && <a className="mt-3 inline-block text-primary underline" href={profile.contactUrl} target="_blank" rel="noopener noreferrer">Contato público ↗</a>}<div className="mt-5"><FollowPromoter promoterId={profile.id} following={profile.isFollowing} count={profile.followerCount} /></div></div></header><section className="space-y-5"><h2 className="text-2xl font-semibold">Eventos publicados</h2>{profile.events.length ? <EventCards events={profile.events} /> : <p className="rounded-2xl border border-dashed p-8 text-muted-foreground">Este organizador ainda não possui eventos publicados.</p>}</section></div></main>;
}
