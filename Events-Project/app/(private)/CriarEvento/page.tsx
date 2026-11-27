import { EventoForm } from "@/components/MyComponents/EventoForm";
import { FadeInView } from "@/components/animations/FadeInView";
import { Highlight } from "@/components/ui/highlight";

export default function CriarEvento() {
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
        <EventoForm />
      </div>
    </div>
  );
}
