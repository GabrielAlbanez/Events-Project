import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { EventoForm } from "@/components/MyComponents/EventoForm";
import { FadeInView } from "@/components/animations/FadeInView";
import { Highlight } from "@/components/ui/highlight";

type CriarEventoProps = { searchParams?: { boasvindas?: string | string[] } };

const linkClass = "rounded-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Shown after the self-service organizer activation redirects here with ?boasvindas=1. */
function OrganizerWelcomeCard() {
  const steps = [
    { key: "create", current: true, content: <><span className="font-semibold text-foreground">Crie o evento</span> (você está aqui)</> },
    { key: "review", current: false, content: <>Triagem automática: publica na hora quando está tudo certo ou diz o que ajustar (o primeiro evento é conferido pela equipe)</> },
    { key: "payments", current: false, content: <>Para vender ingressos, <Link href="/myEvents/pagamentos" className={linkClass}>conecte o Mercado Pago</Link></> },
  ];
  return (
    <section aria-labelledby="organizer-welcome" className="mb-8 rounded-[22px] border border-brand/25 bg-card p-5 shadow-[var(--em-shadow-card)] sm:p-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="organizer-welcome" className="text-lg font-semibold">Sua conta de organizador está ativa</h2>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            {steps.map((step, index) => (
              <li key={step.key} className="flex gap-3" aria-current={step.current ? "step" : undefined}>
                <span aria-hidden="true" className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.current ? "bg-cta text-cta-foreground" : "bg-muted text-foreground"}`}>{index + 1}</span>
                <span className="min-w-0">{step.content}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export default function CriarEvento({ searchParams }: CriarEventoProps) {
  const welcome = searchParams?.boasvindas === "1";
  return (
    <div className="em-page min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10" data-decor="ring">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-start gap-4">
          
          <FadeInView>
            <p className="em-eyebrow">Painel de eventos</p>
            <h1 className="em-title mt-3">Criar <Highlight>evento</Highlight></h1>
            <p className="em-subtitle mt-3">
              Conte o essencial, escolha o local e adicione imagens. As dicas em cada etapa ajudam você a preparar um evento fácil de encontrar.
            </p>
          </FadeInView>
        </div>
        {welcome && <OrganizerWelcomeCard />}
        <EventoForm />
      </div>
    </div>
  );
}
