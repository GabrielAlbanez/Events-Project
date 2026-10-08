import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnedEvent } from "@/app/(actions)/eventos/actions";
import { EventoForm } from "@/components/MyComponents/EventoForm";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Evento } from "@/types";
import { FadeInView } from "@/components/animations/FadeInView";

export default async function EditarEvento({ params }: { params: { id: string } }) {
  const event = await getOwnedEvent(params.id);
  if (!event) notFound();

  return <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-start gap-4"><SidebarTrigger className="mt-1 shrink-0" /><div><FadeInView><p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">Painel de eventos</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Editar evento</h1><p className="mt-2 text-muted-foreground">Atualize as informações e envie novamente quando estiver pronto.</p></FadeInView><Link href="/myEvents" className="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-4">Voltar aos meus eventos</Link></div></header>
      <EventoForm initialEvent={event as Evento} />
    </div>
  </main>;
}
