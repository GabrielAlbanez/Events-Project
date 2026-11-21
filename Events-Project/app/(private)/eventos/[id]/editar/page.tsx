import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnedEvent } from "@/app/(actions)/eventos/actions";
import { EventoForm } from "@/components/MyComponents/EventoForm";
import type { Evento } from "@/types";
import { FadeInView } from "@/components/animations/FadeInView";

export default async function EditarEvento({ params }: { params: { id: string } }) {
  const event = await getOwnedEvent(params.id);
  if (!event) notFound();

  return <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-start gap-4"><div><FadeInView><p className="mb-2 text-sm font-semibold uppercase tracking-widest text-brand">Painel de eventos</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Editar evento</h1><p className="mt-2 text-muted-foreground">{event.status === "PUBLISHED" ? "Ajustes de descrição, imagens e informações práticas são publicados na hora. Mudanças em nome, data, local, ingressos ou preço passam por nova revisão." : "Atualize as informações e envie novamente quando estiver pronto."}</p></FadeInView><div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2"><Link href="/myEvents" className="inline-block text-sm font-medium text-brand underline underline-offset-4">Voltar aos meus eventos</Link>{event.status === "PUBLISHED" && <Link href={`/myEvents/${encodeURIComponent(event.id)}/destaque`} className="inline-block text-sm font-medium text-brand underline underline-offset-4">Destacar evento</Link>}</div></div></header>
      <EventoForm initialEvent={event as Evento} />
    </div>
  </div>;
}
